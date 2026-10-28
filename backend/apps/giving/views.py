import csv
from datetime import date
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import audit
from apps.core.models import AuditLog, ChurchSettings
from apps.core.viewsets import AuditedModelViewSet
from apps.people.models import Person

from .models import Donation, Fund, GiftAidDeclaration
from .serializers import (
    DonationSerializer,
    FundSerializer,
    GiftAidDeclarationSerializer,
    MarkClaimedSerializer,
)

GIFT_AID_RATE = Decimal("0.25")
VIEW = "giving.view"
MANAGE = "giving.manage"
VIEW_OR_MANAGE = (VIEW, MANAGE)
CRUD_MAP = {
    "list": VIEW_OR_MANAGE,
    "retrieve": VIEW_OR_MANAGE,
    "create": MANAGE,
    "update": MANAGE,
    "partial_update": MANAGE,
    "destroy": MANAGE,
}


def _year(request):
    try:
        return int(request.query_params.get("year", date.today().year))
    except ValueError:
        return date.today().year


class FundViewSet(AuditedModelViewSet):
    serializer_class = FundSerializer
    pagination_class = None
    filterset_fields = ["is_active", "is_restricted"]
    search_fields = ["name"]
    permission_map = CRUD_MAP

    def get_queryset(self):
        year = date.today().year
        return Fund.objects.annotate(
            total_this_year=Sum("donations__amount", filter=Q(donations__date__year=year))
        )


class DonationViewSet(AuditedModelViewSet):
    serializer_class = DonationSerializer
    filterset_fields = {
        "fund": ["exact"],
        "person": ["exact", "isnull"],
        "method": ["exact"],
        "date": ["gte", "lte", "year"],
        "eligible_for_gift_aid": ["exact"],
        "gift_aid_claimed_at": ["isnull"],
    }
    search_fields = ["person__first_name", "person__last_name", "reference"]
    ordering_fields = ["date", "amount", "created_at"]
    permission_map = {
        **CRUD_MAP,
        "summary": VIEW_OR_MANAGE,
        "statement": VIEW_OR_MANAGE,
        "gift_aid_claimable": VIEW_OR_MANAGE,
        "mark_claimed": MANAGE,
        "export": VIEW_OR_MANAGE,
    }

    def get_queryset(self):
        return Donation.objects.select_related("person", "fund")

    def perform_destroy(self, instance):
        if instance.gift_aid_claimed_at:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Donations included in a Gift Aid claim cannot be deleted.")
        super().perform_destroy(instance)

    @extend_schema(parameters=[OpenApiParameter("year", int)], responses={200: dict})
    @action(detail=False, methods=["get"])
    def summary(self, request):
        year = _year(request)
        qs = Donation.objects.filter(date__year=year)
        prev = Donation.objects.filter(date__year=year - 1)
        totals = qs.aggregate(total=Sum("amount"), count=Count("id"),
                              donors=Count("person", distinct=True))
        prev_total = prev.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        by_month = {
            row["month"].month: row["total"]
            for row in qs.annotate(month=TruncMonth("date")).values("month")
            .annotate(total=Sum("amount")).order_by("month")
        }
        prev_by_month = {
            row["month"].month: row["total"]
            for row in prev.annotate(month=TruncMonth("date")).values("month")
            .annotate(total=Sum("amount")).order_by("month")
        }
        eligible = qs.gift_aid_eligible()
        eligible_total = eligible.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        unclaimed_total = eligible.filter(gift_aid_claimed_at__isnull=True).aggregate(
            t=Sum("amount"))["t"] or Decimal("0")
        total = totals["total"] or Decimal("0")
        return Response({
            "year": year,
            "currency": ChurchSettings.load().currency,
            "total": total,
            "previous_year_total": prev_total,
            "count": totals["count"],
            "donor_count": totals["donors"],
            "average_gift": (total / totals["count"]).quantize(Decimal("0.01")) if totals["count"] else 0,
            "by_month": [
                {"month": m, "total": by_month.get(m, 0), "previous": prev_by_month.get(m, 0)}
                for m in range(1, 13)
            ],
            "by_fund": list(qs.values("fund__id", "fund__name").annotate(total=Sum("amount"),
                                                                          count=Count("id"))
                            .order_by("-total")),
            "by_method": list(qs.values("method").annotate(total=Sum("amount"), count=Count("id"))
                              .order_by("-total")),
            "gift_aid": {
                "eligible_total": eligible_total,
                "reclaimable": (eligible_total * GIFT_AID_RATE).quantize(Decimal("0.01")),
                "unclaimed_total": unclaimed_total,
                "unclaimed_reclaimable": (unclaimed_total * GIFT_AID_RATE).quantize(Decimal("0.01")),
            },
            "top_donors_count": qs.filter(person__isnull=False).values("person").distinct().count(),
        })

    @extend_schema(parameters=[OpenApiParameter("year", int), OpenApiParameter("person", str)],
                   responses={200: dict})
    @action(detail=False, methods=["get"])
    def statement(self, request):
        """Annual giving statement for one person (or their household)."""
        person = get_object_or_404(Person, pk=request.query_params.get("person"))
        year = _year(request)
        donations = Donation.objects.filter(person=person, date__year=year).select_related("fund")
        church = ChurchSettings.load()
        audit.log(AuditLog.Action.EXPORT, person, changes={"giving_statement": year})
        return Response({
            "church": {"name": church.name, "charity_number": church.charity_number,
                       "address": church.address, "currency": church.currency},
            "person": {"id": str(person.id), "full_name": person.full_name,
                       "address": ", ".join(filter(None, [person.address_line1, person.address_line2,
                                                         person.city, person.postcode]))},
            "year": year,
            "total": donations.aggregate(t=Sum("amount"))["t"] or 0,
            "by_fund": list(donations.values("fund__name").annotate(total=Sum("amount"))
                            .order_by("fund__name")),
            "donations": DonationSerializer(donations.order_by("date"), many=True).data,
        })

    @extend_schema(responses=DonationSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="gift-aid-claimable")
    def gift_aid_claimable(self, request):
        qs = Donation.objects.gift_aid_eligible().filter(
            gift_aid_claimed_at__isnull=True
        ).select_related("person", "fund").order_by("date")
        page = self.paginate_queryset(qs)
        response = self.get_paginated_response(DonationSerializer(page, many=True).data)
        total = qs.aggregate(t=Sum("amount"))["t"] or Decimal("0")
        response.data["total_amount"] = total
        response.data["reclaimable"] = (total * GIFT_AID_RATE).quantize(Decimal("0.01"))
        return response

    @extend_schema(request=MarkClaimedSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="mark-claimed")
    def mark_claimed(self, request):
        ser = MarkClaimedSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        updated = Donation.objects.gift_aid_eligible().filter(
            pk__in=ser.validated_data["donation_ids"], gift_aid_claimed_at__isnull=True
        ).update(gift_aid_claimed_at=ser.validated_data["claimed_on"])
        audit.log(AuditLog.Action.UPDATE, object_type="giving.donation",
                  object_repr=f"Gift Aid claim of {updated} donations",
                  changes={"claimed_on": str(ser.validated_data["claimed_on"]), "count": updated})
        return Response({"updated": updated})

    @extend_schema(responses={(200, "text/csv"): bytes})
    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="donations.csv"'
        w = csv.writer(response)
        w.writerow(["Date", "Donor", "Fund", "Amount", "Method", "Reference", "Gift Aid claimed"])
        for d in qs.iterator():
            w.writerow([d.date, d.person.full_name if d.person else "Anonymous", d.fund.name,
                        d.amount, d.get_method_display(), d.reference, d.gift_aid_claimed_at or ""])
        audit.log(AuditLog.Action.EXPORT, object_type="giving.donation",
                  object_repr="Donations CSV export", changes={"filters": dict(request.query_params)})
        return response


class GiftAidDeclarationViewSet(AuditedModelViewSet):
    serializer_class = GiftAidDeclarationSerializer
    filterset_fields = ["person"]
    search_fields = ["person__first_name", "person__last_name"]
    permission_map = CRUD_MAP

    def get_queryset(self):
        return GiftAidDeclaration.objects.select_related("person")

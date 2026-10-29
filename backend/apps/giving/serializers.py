from rest_framework import serializers

from apps.people.models import Person

from .models import Donation, Fund, GiftAidDeclaration


class FundSerializer(serializers.ModelSerializer):
    total_this_year = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Fund
        fields = ["id", "name", "description", "goal_amount", "is_restricted", "is_active",
                  "total_this_year", "created_at"]
        read_only_fields = ["id", "created_at"]


class DonationSerializer(serializers.ModelSerializer):
    person = serializers.PrimaryKeyRelatedField(
        queryset=Person.objects.filter(anonymised_at__isnull=True), allow_null=True,
        required=False,
    )
    person_name = serializers.CharField(source="person.full_name", read_only=True, default=None)
    fund_name = serializers.CharField(source="fund.name", read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Donation
        fields = ["id", "person", "person_name", "fund", "fund_name", "amount", "date", "method",
                  "method_display", "reference", "notes", "eligible_for_gift_aid",
                  "gift_aid_claimed_at", "created_at"]
        read_only_fields = ["id", "gift_aid_claimed_at", "created_at"]

    def validate(self, attrs):
        if self.instance and self.instance.gift_aid_claimed_at:
            locked = {"amount", "date", "person", "fund"} & set(attrs)
            if any(attrs[f] != getattr(self.instance, f) for f in locked):
                raise serializers.ValidationError(
                    "This donation has been included in a Gift Aid claim and cannot be changed."
                )
        return attrs


class GiftAidDeclarationSerializer(serializers.ModelSerializer):
    person_name = serializers.CharField(source="person.full_name", read_only=True)
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = GiftAidDeclaration
        fields = ["id", "person", "person_name", "start_date", "end_date", "method",
                  "covers_past_four_years", "notes", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_is_active(self, obj) -> bool:
        from datetime import date

        return obj.start_date <= date.today() and (obj.end_date is None or obj.end_date >= date.today())

    def validate(self, attrs):
        start = attrs.get("start_date") or getattr(self.instance, "start_date", None)
        end = attrs.get("end_date") or getattr(self.instance, "end_date", None)
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Must be after the start date."})
        return attrs


class MarkClaimedSerializer(serializers.Serializer):
    donation_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    claimed_on = serializers.DateField()

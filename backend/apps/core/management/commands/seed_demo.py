"""
Populate the database with realistic, entirely fictitious demo data.

    python manage.py seed_demo            # adds demo data
    python manage.py seed_demo --flush    # wipes people/groups/events/giving first

Never run against a production database.
"""

import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from faker import Faker

from apps.accounts.models import Role, User
from apps.core.models import Campus, ChurchSettings
from apps.events.models import Attendance, Event
from apps.giving.models import Donation, Fund, GiftAidDeclaration
from apps.groups.models import Group, GroupMembership, GroupType
from apps.pastoral.models import CareNote, CareRecord
from apps.people.models import Household, Milestone, Person, Position, Tag
from apps.privacy.models import Consent, DataRequest

DEMO_PASSWORD = "Samaritan-Demo-2026!"
TAGS = [("Newcomer", "emerald"), ("Volunteer", "indigo"), ("Needs lift", "amber"),
        ("Musician", "violet"), ("DBS checked", "sky"), ("Housebound", "rose")]
GROUPS = [
    ("Tuesday Home Group", "Small Group", "tue", time(19, 30), "The Wilsons' house",
     "Bible study, prayer and a cup of tea, working through Luke's gospel this term."),
    ("Thursday Home Group", "Small Group", "thu", time(19, 30), "Church lounge",
     "A friendly mid-week group for food, discussion of Sunday's sermon and prayer."),
    ("Young Adults", "Small Group", "sun", time(18, 0), "Coffee shop",
     "For 18 to 30s: honest conversations about faith, work and life."),
    ("Worship Team", "Ministry Team", "thu", time(19, 0), "Main hall",
     "Musicians and singers leading Sunday worship. Rehearsals on Thursdays."),
    ("Welcome Team", "Ministry Team", "sun", time(10, 0), "Foyer",
     "Greeting guests, serving coffee and helping newcomers find their way."),
    ("Tech & AV", "Ministry Team", "sun", time(9, 30), "Sound desk",
     "Sound, slides and livestream for Sunday services."),
    ("Kids Church", "Youth & Children", "sun", time(10, 30), "Kids room",
     "Bible stories, games and crafts for children aged 3 to 11 during the morning service."),
    ("Youth Group", "Youth & Children", "fri", time(19, 0), "Youth hall",
     "Friday nights for 11 to 17 year olds: games, food and a short talk."),
    ("Alpha Course", "Class", "wed", time(19, 0), "Main hall",
     "An 11-week course exploring the basics of the Christian faith over a meal."),
    ("Wednesday Prayer", "Prayer", "wed", time(7, 0), "Chapel",
     "Early-morning prayer for the church, the city and requests from the prayer box."),
    ("Food Bank Volunteers", "Ministry Team", "sat", time(9, 0), "Community room",
     "Sorting donations and running the Saturday food bank with Bristol North Trussell Trust."),
]
WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
CARE_SUBJECTS = {
    "hospital": ["Hip operation recovery", "Hospital visit after fall", "Cardiology admission"],
    "bereavement": ["Loss of mother", "Funeral support", "Anniversary of spouse's death"],
    "prayer": ["Job interview", "Family situation", "Exam season", "Healing"],
    "visit": ["Monthly home visit", "Housebound communion", "New baby visit"],
    "welfare": ["Help with shopping", "Debt advice referral", "Food bank referral"],
    "new_believer": ["Follow up after Alpha", "Baptism preparation"],
    "call": ["Checking in after absence", "Birthday call"],
}


class Command(BaseCommand):
    help = "Seed realistic demo data (fictitious)."

    def add_arguments(self, parser):
        parser.add_argument("--flush", action="store_true")
        parser.add_argument("--households", type=int, default=110)
        parser.add_argument("--seed", type=int, default=2026)

    def handle(self, *args, flush=False, households=110, seed=2026, **options):
        if not settings.DEBUG and not options.get("force"):
            if "production" in settings.SETTINGS_MODULE:
                raise CommandError("Refusing to seed demo data with production settings.")
        random.seed(seed)
        self.fake = Faker("en_GB")
        Faker.seed(seed)
        call_command("bootstrap", verbosity=0)
        with transaction.atomic():
            if flush:
                self._flush()
            self._run(households)

    def _flush(self):
        for model in (Attendance, Event, CareNote, CareRecord, Donation, GiftAidDeclaration,
                      Consent, DataRequest, GroupMembership, Group, Milestone):
            model.objects.all().delete()
        User.objects.filter(email__endswith="@example.org").delete()
        Person.objects.all().delete()
        Household.objects.all().delete()
        Tag.objects.all().delete()
        Campus.objects.all().delete()

    # ------------------------------------------------------------------
    def _run(self, n_households):
        f = self.fake
        today = timezone.localdate()
        church = ChurchSettings.load()
        church.name = "Grace Community Church"
        church.legal_name = "Grace Community Church (Demo) CIO"
        church.charity_number = "1234567"
        church.email = "office@example.org"
        church.dpo_email = "privacy@example.org"
        church.address = "1 Chapel Street, Bristol, BS1 1AA"
        church.require_mfa = False
        church.save()

        main = Campus.objects.create(name="City Centre", address="1 Chapel Street, Bristol")
        north = Campus.objects.create(name="North", address="Community Centre, Horfield")
        tags = {name: Tag.objects.create(name=name, color=color) for name, color in TAGS}
        positions = {p.name: p for p in Position.objects.all()}

        people: list[Person] = []
        for _ in range(n_households):
            last = f.last_name()
            campus = main if random.random() < 0.75 else north
            hh = Household.objects.create(
                name=f"{last} household", address_line1=f.street_address(), city=f.city(),
                postcode=f.postcode(), country="United Kingdom", campus=campus,
                phone=f.phone_number() if random.random() < 0.5 else "",
            )
            shape = random.choices(["single", "couple", "family", "single_parent", "senior"],
                                   [25, 20, 35, 10, 10])[0]
            adults = 1 if shape in ("single", "single_parent") else 2
            base_age = random.randint(65, 88) if shape == "senior" else random.randint(22, 60)
            members = []
            for i in range(adults):
                gender = random.choice(["female", "male"])
                first = f.first_name_female() if gender == "female" else f.first_name_male()
                age = base_age + random.randint(-3, 3)
                members.append(self._person(first, last, gender, age, hh,
                                            "head" if i == 0 else "spouse", campus))
            if shape in ("family", "single_parent"):
                for _ in range(random.randint(1, 4)):
                    gender = random.choice(["female", "male"])
                    first = f.first_name_female() if gender == "female" else f.first_name_male()
                    age = random.randint(0, min(17, max(base_age - 20, 0)))
                    members.append(self._person(first, last, gender, age, hh, "child", campus,
                                                parent=members[0]))
            people.extend(members)

        adults = [p for p in people if not p.is_child]
        children = [p for p in people if p.is_child]

        # Tags & positions
        for p in random.sample(adults, 40):
            p.tags.add(tags["Volunteer"])
        for p in random.sample(adults, 12):
            p.tags.add(tags["Musician"])
        for p in random.sample(adults, 25):
            p.tags.add(tags["DBS checked"])
        for p in [p for p in people if p.status == "visitor"][:20]:
            p.tags.add(tags["Newcomer"])
        seniors = [p for p in adults if (p.age or 0) > 75]
        for p in seniors[:6]:
            p.tags.add(tags["Housebound"])
        for p in seniors[6:10]:
            p.tags.add(tags["Needs lift"])
        members = [p for p in adults if p.status == "member"]
        for name, count in [("Elder", 4), ("Deacon", 5), ("Worship Leader", 2), ("Treasurer", 1),
                            ("Safeguarding Lead", 1), ("Youth Leader", 2)]:
            for p in random.sample(members, count):
                p.positions.add(positions[name])

        # Groups
        groups = {}
        types = {t.name: t for t in GroupType.objects.all()}
        for name, gtype, day, t, loc, desc in GROUPS:
            g = Group.objects.create(
                name=name, group_type=types[gtype], meeting_day=day, meeting_time=t, location=loc,
                campus=main, description=desc, is_children=gtype == "Youth & Children",
            )
            groups[name] = g
            pool = children if g.is_children else adults
            size = random.randint(6, 16) if not g.is_children else min(len(children), 25)
            if gtype == "Small Group":
                g.capacity = random.choice([16, 18, 20])
                g.save(update_fields=["capacity"])
            chosen = random.sample(pool, min(size, len(pool)))
            leaders = random.sample(members, 2)
            for i, leader in enumerate(leaders):
                GroupMembership.objects.get_or_create(
                    group=g, person=leader,
                    defaults={"role": "leader" if i == 0 else "co_leader",
                              "joined_on": today - timedelta(days=random.randint(200, 1500))})
            for p in chosen:
                GroupMembership.objects.get_or_create(
                    group=g, person=p,
                    defaults={"role": "member",
                              "joined_on": today - timedelta(days=random.randint(10, 900))})

        # Services: 16 weeks back, 4 ahead
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        regulars = [p for p in people if p.status in ("member", "regular")]
        for w in range(-16, 5):
            d = sunday + timedelta(weeks=w)
            for campus, hour in ((main, 10), (north, 11)):
                ev = Event.objects.create(
                    title="Sunday Morning Service", kind="service", campus=campus,
                    starts_at=timezone.make_aware(datetime.combine(d, time(hour, 30))),
                    ends_at=timezone.make_aware(datetime.combine(d, time(hour + 1, 45))),
                    location="Main hall" if campus == main else "Community Centre",
                )
                if w <= 0:
                    seasonal = 1.0 + 0.08 * random.random() - (0.15 if w in (-7, -6) else 0)
                    pool = [p for p in regulars if p.campus_id == campus.id]
                    present = random.sample(pool, int(len(pool) * 0.62 * seasonal))
                    now = ev.starts_at - timedelta(minutes=10)
                    Attendance.objects.bulk_create([
                        Attendance(event=ev, person=p, status="present", checked_in_at=now,
                                   checked_out_at=ev.ends_at if p.is_child else None,
                                   security_code=Attendance.new_security_code() if p.is_child else "")
                        for p in present
                    ])
                    ev.headcount = len(present) + random.randint(8, 30)
                    ev.save(update_fields=["headcount"])
        # Group meetings + one-off events
        for g in list(groups.values())[:4]:
            offset = (WEEKDAYS[g.meeting_day] - today.weekday()) % 7
            for w in range(-6, 2):
                d = today + timedelta(days=offset) + timedelta(weeks=w)
                ev = Event.objects.create(
                    title=g.name, kind="group_meeting", group=g, campus=main, location=g.location,
                    starts_at=timezone.make_aware(datetime.combine(d, g.meeting_time or time(19)))
                )
                if w < 0:
                    for m in g.memberships.all():
                        if random.random() < 0.75:
                            Attendance.objects.create(event=ev, person=m.person, status="present",
                                                      checked_in_at=ev.starts_at)
        for title, kind, days in [("Harvest Supper", "social", 12), ("Baptism Service", "service", 26),
                                  ("Community Carol Service", "outreach", 55),
                                  ("Leaders' Prayer Breakfast", "prayer", 5)]:
            Event.objects.create(
                title=title, kind=kind, campus=main, location="Main hall",
                starts_at=timezone.make_aware(datetime.combine(today + timedelta(days=days), time(18, 0))),
                description=f.paragraph(nb_sentences=2),
            )

        # Giving: ~18 months
        funds = list(Fund.objects.all())
        general = Fund.objects.get(name="General Fund")
        givers = random.sample(adults, int(len(adults) * 0.45))
        start = date(today.year - 1, 1, 1)
        donations = []
        for p in givers:
            monthly = Decimal(random.choice([10, 20, 25, 30, 40, 50, 75, 100, 150, 200]))
            if random.random() < 0.7:
                GiftAidDeclaration.objects.create(
                    person=p, start_date=start - timedelta(days=random.randint(0, 900)),
                    method=random.choice(["written", "online"]),
                )
            d = start.replace(day=min(28, random.randint(1, 28)))
            while d <= today:
                donations.append(Donation(person=p, fund=general, amount=monthly, date=d,
                                          method=random.choice(["bank_transfer", "direct_debit"])))
                if random.random() < 0.12:
                    donations.append(Donation(
                        person=p, fund=random.choice(funds), date=d + timedelta(days=3),
                        amount=Decimal(random.choice([20, 50, 100, 250])), method="online"))
                d = (d + timedelta(days=32)).replace(day=d.day)
        sunday_cursor = start - timedelta(days=start.weekday() + 1)
        while sunday_cursor <= today:
            donations.append(Donation(fund=general, date=sunday_cursor, method="cash",
                                      amount=Decimal(random.randint(80, 260)),
                                      reference="Loose offering", eligible_for_gift_aid=False))
            sunday_cursor += timedelta(weeks=1)
        Donation.objects.bulk_create(donations)
        last_year_claim = date(today.year - 1, 12, 31)
        Donation.objects.gift_aid_eligible().filter(date__lte=last_year_claim) \
            .update(gift_aid_claimed_at=date(today.year, 1, 20))

        # Milestones
        for p in members:
            if random.random() < 0.8:
                Milestone.objects.create(person=p, kind="baptism",
                                         date=today - timedelta(days=random.randint(100, 9000)),
                                         place=random.choice(["Grace Community Church", "River Avon",
                                                              "St Mary's"]))
            if p.membership_date:
                Milestone.objects.create(person=p, kind="membership", date=p.membership_date)
        for p in random.sample(members, 5):
            Milestone.objects.create(person=p, kind="baptism",
                                     date=today - timedelta(days=random.randint(5, 200)),
                                     place="Grace Community Church")

        # Consent ledger
        recorder = None
        for p in people:
            guardian = p.is_child
            for purpose, prob in (("email", 0.78), ("sms", 0.4), ("photo", 0.6),
                                  ("directory", 0.7), ("post", 0.5)):
                if random.random() < 0.9:
                    Consent.objects.create(
                        person=p, purpose=purpose, granted=random.random() < prob,
                        method=random.choice(["paper", "online"]), given_by_guardian=guardian,
                        recorded_by=recorder,
                        recorded_at=timezone.now() - timedelta(days=random.randint(1, 700)),
                    )

        # Users (one per role) - fictitious example.org accounts
        roles = {r.name: r for r in Role.objects.all()}
        leader_person = groups["Tuesday Home Group"].memberships.get(role="leader").person
        users = [
            ("admin@example.org", "Alex", "Admin", "Administrator", None, True),
            ("pastor@example.org", "Pat", "Shepherd", "Pastor", None, False),
            ("office@example.org", "Olivia", "Office", "Church Office", None, False),
            ("finance@example.org", "Fin", "Treasurer", "Finance", None, False),
            ("leader@example.org", leader_person.first_name, leader_person.last_name,
             "Group Leader", leader_person, False),
            ("readonly@example.org", "Rory", "Reader", "Read Only", None, False),
        ]
        created_users = {}
        for email, first, last, role, person, su in users:
            u, _ = User.objects.get_or_create(email=email, defaults={
                "first_name": first, "last_name": last, "role": roles[role], "person": person,
                "is_superuser": su, "is_staff": su,
            })
            u.set_password(DEMO_PASSWORD)
            u.save()
            created_users[role] = u
        pastor = created_users["Pastor"]

        # Pastoral care
        for _ in range(28):
            kind = random.choice(list(CARE_SUBJECTS))
            p = random.choice(adults)
            status = random.choices(["open", "follow_up", "closed"], [40, 25, 35])[0]
            rec = CareRecord.objects.create(
                person=p, kind=kind, subject=random.choice(CARE_SUBJECTS[kind]),
                details=f.paragraph(nb_sentences=3), status=status,
                priority=random.choices(["low", "normal", "high", "urgent"], [20, 55, 18, 7])[0],
                occurred_on=today - timedelta(days=random.randint(0, 90)),
                follow_up_on=today + timedelta(days=random.randint(-5, 21)) if status != "closed" else None,
                assigned_to=pastor if random.random() < 0.6 else None,
                is_confidential=kind in ("bereavement", "welfare") and random.random() < 0.5,
                created_by=pastor, closed_at=timezone.now() if status == "closed" else None,
            )
            for _ in range(random.randint(0, 3)):
                CareNote.objects.create(record=rec, body=f.sentence(nb_words=16), created_by=pastor)

        # Data subject requests
        for kind, status, days_ago in [("access", "in_progress", 12), ("erasure", "received", 3),
                                       ("rectification", "completed", 40), ("access", "verifying", 33)]:
            p = random.choice(adults)
            DataRequest.objects.create(
                person=p, requester_name=p.full_name, requester_email=p.email, kind=kind,
                status=status, received_on=today - timedelta(days=days_ago),
                description="Request received by email to the church office.",
                completed_on=today - timedelta(days=days_ago - 10) if status == "completed" else None,
            )

        # Archived person past retention (to demonstrate the retention job)
        old = random.choice(adults)
        old.status = "former"
        old.archived_at = timezone.now() - timedelta(days=365 * 7)
        old.archive_reason = "Moved away"
        old.save()

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(people)} people in {n_households} households, {len(groups)} groups, "
            f"{Event.objects.count()} events, {Donation.objects.count()} donations."
        ))
        self.stdout.write(f"Demo logins (password: {DEMO_PASSWORD}):")
        for email, *_ in users:
            self.stdout.write(f"  {email}")
        self.stdout.write(self.style.WARNING(
            "Demo mode: two-factor enforcement is OFF. Turn it on in Settings > Security."))

    def _person(self, first, last, gender, age, household, role, campus, parent=None):
        f = self.fake
        today = timezone.localdate()
        dob = today - timedelta(days=age * 365 + random.randint(0, 364))
        is_child = age < 18
        status = random.choices(["member", "regular", "visitor", "inactive"], [50, 28, 12, 10])[0]
        if is_child and parent:
            status = parent.status if parent.status != "member" else "regular"
        created = timezone.now() - timedelta(days=random.randint(0, 1400))
        membership_date = (
            today - timedelta(days=random.randint(100, 6000)) if status == "member" else None
        )
        if status == "visitor":
            created = timezone.now() - timedelta(days=random.randint(0, 120))
        p = Person.objects.create(
            first_name=first, last_name=last, gender=gender, date_of_birth=dob,
            email="" if is_child else f"{first}.{last}{random.randint(1, 99)}@example.com".lower(),
            phone_mobile="" if age < 12 else f"07{random.randint(100000000, 999999999)}",
            address_line1=household.address_line1, city=household.city,
            postcode=household.postcode, country="United Kingdom",
            household=household, household_role=role, campus=campus, status=status,
            membership_date=membership_date,
            first_visit_date=min(
                [d for d in (created.date(), membership_date) if d]
            ),
            marital_status="married" if role in ("head", "spouse") and household.members.count() else "",
            occupation="" if is_child or age > 70 else f.job()[:120],
            medical_notes=random.choice(["", "", "", "Nut allergy - carries EpiPen", "Asthma (inhaler)",
                                         "Type 1 diabetes"]) if is_child else "",
            emergency_contact_name=f"{parent.first_name} {parent.last_name}" if is_child and parent else "",
            emergency_contact_phone=parent.phone_mobile if is_child and parent else "",
            how_heard=random.choice(["", "Friend", "Website", "Walked past", "Alpha", "Community event"]),
        )
        Person.objects.filter(pk=p.pk).update(created_at=created)
        p.created_at = created
        return p

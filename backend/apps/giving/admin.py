from django.contrib import admin

from .models import Donation, Fund, GiftAidDeclaration

admin.site.register([Fund, Donation, GiftAidDeclaration])

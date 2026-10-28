from django.urls import path

from . import views

urlpatterns = [
    path("csrf/", views.CSRFView.as_view(), name="auth-csrf"),
    path("login/", views.LoginView.as_view(), name="auth-login"),
    path("mfa/verify/", views.MFAVerifyView.as_view(), name="auth-mfa-verify"),
    path("refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("password/change/", views.PasswordChangeView.as_view(), name="auth-password-change"),
    path("password/reset/", views.PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password/reset/confirm/", views.PasswordResetConfirmView.as_view(),
         name="auth-password-reset-confirm"),
    path("mfa/setup/", views.MFASetupView.as_view(), name="auth-mfa-setup"),
    path("mfa/enable/", views.MFAEnableView.as_view(), name="auth-mfa-enable"),
    path("mfa/disable/", views.MFADisableView.as_view(), name="auth-mfa-disable"),
    path("mfa/recovery-codes/", views.RecoveryCodesView.as_view(), name="auth-mfa-recovery"),
]

"""
Role-based access control catalogue.

Permissions are coarse, human-readable capability codes grouped by module.
Roles are editable bundles of these codes. Superusers implicitly hold all.
"""

PERMISSIONS: dict[str, dict[str, str]] = {
    "People & households": {
        "people.view": "View people and households",
        "people.create": "Add people and households",
        "people.edit": "Edit people and households",
        "people.archive": "Archive / restore people",
        "people.view_sensitive": "View special-category data (medical, confidential notes)",
        "people.export": "Export people lists (CSV)",
    },
    "Groups": {
        "groups.view": "View all groups",
        "groups.manage": "Create and manage all groups",
        "groups.lead": "Lead own groups (see and manage members of groups they lead)",
    },
    "Events & attendance": {
        "events.view": "View events",
        "events.manage": "Create and manage events",
        "attendance.record": "Record attendance and check-ins",
    },
    "Giving": {
        "giving.view": "View donations, funds and statements",
        "giving.manage": "Record donations, manage funds and Gift Aid",
    },
    "Pastoral care": {
        "pastoral.view": "View pastoral care records",
        "pastoral.manage": "Create and update pastoral care records",
        "pastoral.view_confidential": "View records marked confidential",
    },
    "Communications": {
        "comms.view": "View sent messages",
        "comms.send": "Compose and send messages",
    },
    "Privacy & GDPR": {
        "privacy.view": "View consent records and data subject requests",
        "privacy.manage": "Record consent, handle requests, export & erase personal data",
    },
    "Administration": {
        "users.manage": "Manage user accounts and roles",
        "settings.manage": "Manage church settings, campuses and lookups",
        "audit.view": "View the audit log",
    },
}

ALL_PERMISSIONS: set[str] = {code for group in PERMISSIONS.values() for code in group}


def catalogue() -> list[dict]:
    return [
        {
            "group": group,
            "permissions": [{"code": c, "label": label} for c, label in perms.items()],
        }
        for group, perms in PERMISSIONS.items()
    ]


DEFAULT_ROLES: dict[str, dict] = {
    "Administrator": {
        "description": "Full access to every module, including users, roles and settings.",
        "permissions": sorted(ALL_PERMISSIONS),
    },
    "Pastor": {
        "description": "Pastoral leadership with access to people, groups, care and communications.",
        "permissions": [
            "people.view", "people.create", "people.edit", "people.archive",
            "people.view_sensitive", "people.export",
            "groups.view", "groups.manage",
            "events.view", "events.manage", "attendance.record",
            "pastoral.view", "pastoral.manage", "pastoral.view_confidential",
            "comms.view", "comms.send",
            "privacy.view",
        ],
    },
    "Church Office": {
        "description": "Administrators who maintain the membership database and handle GDPR requests.",
        "permissions": [
            "people.view", "people.create", "people.edit", "people.archive", "people.export",
            "groups.view", "groups.manage",
            "events.view", "events.manage", "attendance.record",
            "comms.view", "comms.send",
            "privacy.view", "privacy.manage",
        ],
    },
    "Finance": {
        "description": "Treasurers: giving records, funds and Gift Aid.",
        "permissions": ["people.view", "giving.view", "giving.manage"],
    },
    "Group Leader": {
        "description": "Sees and manages only the groups they lead, and records their attendance.",
        "permissions": ["groups.lead", "events.view", "attendance.record"],
    },
    "Read Only": {
        "description": "View-only access to the directory, groups and events.",
        "permissions": ["people.view", "groups.view", "events.view"],
    },
}

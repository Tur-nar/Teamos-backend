# TeamOS Notification System

_Released 2026-09-05_

TeamOS now proactively keeps you informed. In app notifications, optional email alerts, and automated monitoring mean you will never miss a deadline or overlook a struggling target again.

## Highlights

- **In app notifications**: Every important event, from task assignments to missed targets, now generates a notification you can view, mark as read, or dismiss from your notification feed.
- **Automated deadline monitoring**: Tasks approaching their deadline within 24 hours trigger a warning notification automatically, so you have time to act before it is too late.
- **Target health detection**: Targets within 3 days of their deadline and below 50% progress are flagged as at risk, and targets that pass their deadline without completion are automatically marked as missed with notifications sent to both the assignee and creator.
- **Email forwarding**: Organization administrators can enable email notifications for specific event types, and users will receive styled email alerts alongside their in app notifications.

## Improvements

- Bulk notification dispatch uses a single Redis round trip instead of one per recipient, making multi user notifications faster and more efficient
- Complaint events (creation and status changes) now trigger notifications to affected users and administrators
- Review cycle activation notifies all eligible participants
- Task assignments and completions notify the relevant team members

## Fixes

- Fixed a progress calculation threshold that compared a 0 to 1 ratio against 50 instead of 0.5, which caused virtually all targets to be incorrectly flagged as at risk regardless of their actual progress

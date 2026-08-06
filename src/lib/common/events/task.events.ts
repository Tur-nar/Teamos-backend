export const TASK_EVENTS = {
    CREATED: 'task.created',
    STATUS_CHANGED: 'task.statusChanged',
    DELETED: 'task.deleted',
    REASSIGNED: 'task.reassigned',
} as const;

export class TaskCreatedEvent {
    constructor(
        public readonly orgId: string,
        public readonly assigneeId: string,
    ) { }
}

export class TaskStatusChangedEvent {
    constructor(
        public readonly orgId: string,
        public readonly assigneeId: string,
        public readonly oldStatus: string,
        public readonly newStatus: string,
    ) { }
}

export class TaskDeletedEvent {
    constructor(
        public readonly orgId: string,
        public readonly assigneeId: string,
        public readonly oldStatus: string,
    ) { }
}

export class TaskReassignedEvent {
    constructor(
        public readonly orgId: string,
        public readonly previousAssigneeId: string,
        public readonly newAssigneeId: string,
    ) { }
}
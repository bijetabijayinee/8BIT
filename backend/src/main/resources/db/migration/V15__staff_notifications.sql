create table staff_notification (
    id uuid primary key,
    recipient_role varchar(255) not null,
    recipient_staff_id uuid references staff_user(id),
    patient_id uuid references patient(id),
    patient_display_id varchar(255),
    agent varchar(255) not null,
    category varchar(255) not null,
    title varchar(255) not null,
    body text not null,
    read_flag boolean not null,
    created_at timestamp with time zone not null
);

create index idx_notification_role_created on staff_notification (recipient_role, created_at desc);
create index idx_notification_staff_created on staff_notification (recipient_staff_id, created_at desc);

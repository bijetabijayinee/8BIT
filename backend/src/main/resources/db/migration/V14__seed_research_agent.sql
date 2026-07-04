insert into system_agent (id, code, name, task_type, description, instructions, active, created_at, updated_at) values
    ('50505050-5050-5050-5050-505050505050', 'RESEARCH_AGENT', 'Medical Research Agent', 'RESEARCH', 'Searches online medical articles for intake symptoms and saves findings to the patient record.', 'After each intake, search reputable online articles about the presented symptoms or suggested diagnosis, then save article summaries and links to the patient thread and timeline.', true, now(), now())
on conflict (code) do nothing;

-- AI Coach chat replies run through tennis-agent like every other Claude task.
alter type public.agent_job_kind add value if not exists 'coach_chat';

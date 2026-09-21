-- Karyalaya local seed: one tenant (Alcadent India), its config, services,
-- Tier 1 agents and a small knowledge base. Everything here is configuration —
-- onboarding a second clinic is another block like this one, never new code.

insert into public.tenants (id, slug, name, vertical, plan, status, timezone, locale)
values (
  '11111111-1111-4111-8111-111111111111',
  'alcadent',
  'Alcadent India',
  'dental_clinic',
  'growth',
  'active',
  'Asia/Kolkata',
  'en-IN'
)
on conflict (id) do nothing;

insert into public.tenant_config (tenant_id, business, hours, brand, channels, escalation, limits)
values (
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object(
    'legal_name', 'Alcadent India',
    'tagline', 'Kids & Adult Dentistry',
    'lead_clinician', 'Dr. Anukriti Gupta, Chief Pediatric Dental Surgeon',
    'experience_years', 14,
    'address', 'F-49, First Floor, Elan Miracle Mall, Sector 84, Gurugram 122004',
    'maps_url', 'https://maps.google.com/?q=Elan+Miracle+Mall+Sector+84+Gurugram',
    'whatsapp', '+919889885908',
    'highlights', jsonb_build_array(
      'Painless injection technique',
      'Conscious sedation for anxious children',
      'Open 7 days'
    )
  ),
  jsonb_build_object(
    'mon', jsonb_build_array('10:00', '20:00'),
    'tue', jsonb_build_array('10:00', '20:00'),
    'wed', jsonb_build_array('10:00', '20:00'),
    'thu', jsonb_build_array('10:00', '20:00'),
    'fri', jsonb_build_array('10:00', '20:00'),
    'sat', jsonb_build_array('10:00', '20:00'),
    'sun', jsonb_build_array('11:00', '17:00')
  ),
  jsonb_build_object(
    'ink', '#14442B',
    'primary', '#2E7D4F',
    'surface', '#EDF2E6',
    'cream', '#FAF7EF',
    'accent', '#D08C2E',
    'body', '#3C5344',
    'heading_font', 'Plus Jakarta Sans',
    'accent_font', 'Caveat',
    'confirmed_by_client', false
  ),
  jsonb_build_object(
    'whatsapp', jsonb_build_object('enabled', true, 'phone_number_id', 'DEV_TEST_NUMBER'),
    'webchat', jsonb_build_object('enabled', true),
    'instagram', jsonb_build_object('enabled', false),
    'voice', jsonb_build_object('enabled', false)
  ),
  jsonb_build_object(
    'inbox_url', '/inbox',
    'notify_roles', jsonb_build_array('owner', 'manager'),
    'office_hours_only', false
  ),
  jsonb_build_object(
    'ai_conversations_per_month', 2000,
    'template_messages_per_month', 500,
    'voice_minutes_per_month', 0
  )
)
on conflict (tenant_id) do nothing;

insert into public.channel_identities (tenant_id, channel, external_id, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'whatsapp', 'DEV_TEST_NUMBER', 'Alcadent WhatsApp (dev)'),
  ('11111111-1111-4111-8111-111111111111', 'webchat', 'alcadent', 'Alcadent web widget')
on conflict (channel, external_id) do nothing;

insert into public.resources (tenant_id, slug, name)
values
  ('11111111-1111-4111-8111-111111111111', 'chair-1', 'Chair 1'),
  ('11111111-1111-4111-8111-111111111111', 'chair-2', 'Chair 2')
on conflict (tenant_id, slug) do nothing;

insert into public.services (tenant_id, slug, name, description, duration_minutes, price_paise, price_is_estimate, recall_months)
values
  ('11111111-1111-4111-8111-111111111111', 'consultation', 'Consultation', 'First visit, examination and treatment plan discussion.', 30, 50000, true, 6),
  ('11111111-1111-4111-8111-111111111111', 'cleaning', 'Scaling & polishing', 'Routine cleaning for adults and older children.', 45, 150000, true, 6),
  ('11111111-1111-4111-8111-111111111111', 'kids-checkup', 'Kids check-up', 'Child-friendly examination with fluoride application if needed.', 30, 80000, true, 6),
  ('11111111-1111-4111-8111-111111111111', 'rct-sitting', 'Root canal sitting', 'Follow-up sitting for an in-progress root canal.', 60, null, true, null)
on conflict (tenant_id, slug) do nothing;

insert into public.agents (
  tenant_id, slug, name, description, system_prompt_template,
  tool_allowlist, trigger, trigger_config, escalation_rule, tenant_variables, model_hint
)
values
(
  '11111111-1111-4111-8111-111111111111',
  'front-desk',
  'WhatsApp Front Desk',
  'Answers enquiries in Hindi and English around the clock and books appointments.',
  $prompt$You are the front desk assistant for {{business_name}}, {{tagline}}.

Facts you may state:
- Clinician: {{lead_clinician}}, {{experience_years}}+ years.
- Address: {{address}}
- Opening hours: {{hours_summary}}
- Services and indicative prices: {{services_summary}}

How to reply:
- Match the customer's language. Hindi, English or a natural mix of both is fine.
- Short sentences. Warm and plain, parent to parent. No exclamation stacking, no emoji in the first line.
- If you do not know something, say so and offer to have the team confirm.

Hard limits:
- You do not diagnose, do not interpret symptoms, x-rays or photographs, and do not
  recommend treatment. Those questions go to {{lead_clinician}} — offer an appointment.
- You do not quote a final price or a treatment duration. Prices given are indicative
  and confirmed at the clinic after examination.
- No superlatives ("best in Gurugram"), no guaranteed outcomes.
- General oral-hygiene information (brushing, flossing, sugar, routine check-up
  frequency) is fine.

When someone wants an appointment, collect the name, the service and a preferred day
and time, then use the booking tools. Confirm back in one short message.

If the customer is distressed, asks for a human, or asks anything outside these limits,
escalate to the team.$prompt$,
  array['search_knowledge', 'list_services', 'find_slots', 'create_booking', 'escalate_to_human'],
  'inbound_message',
  jsonb_build_object('channels', jsonb_build_array('whatsapp', 'webchat')),
  jsonb_build_object('on_low_confidence', true, 'on_keywords', jsonb_build_array('emergency', 'bleeding', 'complaint', 'refund', 'दर्द')),
  jsonb_build_object('business_name', 'Alcadent India', 'tagline', 'Kids & Adult Dentistry'),
  'claude-haiku-4-5-20251001'
),
(
  '11111111-1111-4111-8111-111111111111',
  'recall',
  'Recall Agent',
  'Six-month check-up reminders, pending treatment sittings and follow-ups.',
  $prompt$You write a single short recall message for {{business_name}}.

Context: {{recall_context}}

Rules:
- One message, under 350 characters, in the customer's language.
- Warm, not pushy. State what is due and offer two concrete time options.
- Never imply a clinical finding, urgency or risk. No fear-mongering.
- Always include how to opt out: "Reply STOP to stop reminders."$prompt$,
  array['list_services', 'find_slots', 'send_message', 'escalate_to_human'],
  'schedule',
  jsonb_build_object('cron', '0 4 * * *', 'lookback_months', 6),
  jsonb_build_object('requires_consent', true, 'max_attempts', 2),
  jsonb_build_object('business_name', 'Alcadent India'),
  'claude-haiku-4-5-20251001'
),
(
  '11111111-1111-4111-8111-111111111111',
  'content-studio',
  'Content Studio',
  'Weekly carousels, reel scripts and story frames in the brand kit, held for clinician approval.',
  $prompt$You draft social content for {{business_name}} in its brand voice.

Voice: warm, plain, parent to parent. Short sentences. Hindi-English mixing is allowed
in captions, never in headlines. No emoji in headlines, no exclamation stacking.

Formats: 1080x1350 for feed and carousels, 1080x1920 for stories.

Never claim: guaranteed outcomes, "best in Gurugram" style superlatives, or any price
or treatment duration that is not in {{services_summary}}.

Every draft that touches a clinical topic is marked pending_clinician_approval. You do
not publish. You produce a draft and a one-line note on what the clinician should check.$prompt$,
  array['search_knowledge', 'list_services', 'create_content_draft'],
  'schedule',
  jsonb_build_object('cron', '0 3 * * 1'),
  jsonb_build_object('requires_clinician_approval', true),
  jsonb_build_object('business_name', 'Alcadent India'),
  'claude-sonnet-5'
)
on conflict (tenant_id, slug) do nothing;

insert into public.knowledge_chunks (tenant_id, source, title, content, metadata)
values
  ('11111111-1111-4111-8111-111111111111', 'clinic_facts', 'Opening hours',
   'Alcadent India is open seven days a week. Monday to Saturday 10:00 to 20:00, Sunday 11:00 to 17:00. Walk-ins are accepted but an appointment is faster.',
   jsonb_build_object('approved_by', 'clinic')),
  ('11111111-1111-4111-8111-111111111111', 'clinic_facts', 'Location and parking',
   'F-49, First Floor, Elan Miracle Mall, Sector 84, Gurugram 122004. Parking is available in the mall basement. The clinic is on the first floor, near the atrium lifts.',
   jsonb_build_object('approved_by', 'clinic')),
  ('11111111-1111-4111-8111-111111111111', 'clinic_facts', 'Anxious children',
   'The clinic uses a painless injection technique and offers conscious sedation for children who are very anxious. Parents can stay with the child during the visit. A first visit is usually a short, friendly familiarisation appointment.',
   jsonb_build_object('approved_by', 'clinic')),
  ('11111111-1111-4111-8111-111111111111', 'oral_hygiene', 'Brushing for children',
   'Children should brush twice a day with a pea-sized amount of fluoride toothpaste, with adult supervision until about age seven. Replace the brush every three months. Limit sugary drinks between meals.',
   jsonb_build_object('approved_by', 'clinic'))
on conflict do nothing;

insert into public.templates (tenant_id, name, language, category, body, variables, status)
values
  ('11111111-1111-4111-8111-111111111111', 'recall_six_month', 'en', 'utility',
   'Hi {{1}}, it has been six months since your last visit to Alcadent. Would you like to book a check-up? Reply STOP to stop reminders.',
   array['customer_name'], 'draft'),
  ('11111111-1111-4111-8111-111111111111', 'appointment_reminder', 'en', 'utility',
   'Hi {{1}}, reminder of your appointment at Alcadent on {{2}}. Reply RESCHEDULE if you need a different time.',
   array['customer_name', 'appointment_time'], 'draft')
on conflict (tenant_id, name, language) do nothing;

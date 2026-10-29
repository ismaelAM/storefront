#!/usr/bin/env python3
"""Emit a read-only PostgreSQL regression query for the actual pending-mail SQL.

Run: python operations/email-http-pending-fixtures.py | psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL"
No business tables, functions, jobs or messages are changed. All tables are CTEs.
"""
import copy
import json
from pathlib import Path

setup = Path(__file__).with_name('email-http-setup.sql').read_text()
body = setup.split('AS $function$')[1].split('$function$;')[0].strip()

schemas = {
    'spree_stores': 'id bigint, code text, deleted_at timestamptz',
    'spree_webhook_endpoints': 'id bigint, store_id bigint, created_at timestamptz, deleted_at timestamptz, name text, url text, active boolean, disabled_at timestamptz, subscriptions jsonb',
    'solid_queue_jobs': 'id bigint, finished_at timestamptz, queue_name text, class_name text, arguments jsonb, created_at timestamptz',
    'spree_webhook_deliveries': 'id bigint, webhook_endpoint_id bigint, created_at timestamptz, event_name text, success boolean, delivered_at timestamptz',
    'spree_payment_sessions': 'id bigint, payment_method_id bigint',
    'spree_payment_methods': 'id bigint, store_id bigint, type text, name text, active boolean, deleted_at timestamptz, created_at timestamptz',
    'solid_queue_ready_executions': 'job_id bigint',
    'solid_queue_scheduled_executions': 'job_id bigint, scheduled_at timestamptz',
    'solid_queue_processes': 'kind text, name text, last_heartbeat_at timestamptz',
    'bison_email_delivery_attempts': 'delivery_id bigint, attempts integer, next_attempt_at timestamptz, last_attempt_at timestamptz',
}
base = {table: [] for table in schemas}
base['spree_stores'] = [dict(id=4, code='bisontcg')]
base['spree_webhook_endpoints'] = [dict(
    id=2, store_id=4, created_at='2026-01-02T00:00:00Z',
    name='BisonTCG storefront transactional email',
    url='https://www.bisontcg.com/api/webhooks/spree', active=True,
    subscriptions=['order.completed', 'order.canceled', 'order.shipped', 'customer.password_reset_requested'])]
base['spree_payment_methods'] = [dict(id=9, store_id=4, type='SpreeStripe::Gateway',
    name='Stripe BisonTCG', active=True, created_at='2026-01-02T00:00:00Z')]
base['spree_payment_sessions'] = [dict(id=7, payment_method_id=9)]

def job(kind='event'):
    args = {
        'event': ['Spree::WebhookEventSubscriber', dict(name='order.completed', store_id='4')],
        'delivery': ['5'],
        'payment': [dict(action='captured', payment_session_id='7', payment_method_id='9')],
    }[kind]
    return dict(id=1, queue_name={'event': 'spree_events', 'delivery': 'spree_webhooks', 'payment': 'default'}[kind],
        class_name={'event': 'Spree::Events::SubscriberJob', 'delivery': 'Spree::WebhookDeliveryJob', 'payment': 'Spree::Payments::HandleWebhookJob'}[kind],
        arguments=dict(arguments=args), created_at='2026-01-03T00:00:00Z')

def delivery():
    return dict(id=5, webhook_endpoint_id=2, created_at='2026-01-03T00:00:00Z',
        event_name='order.completed', success=False, delivered_at='2026-01-04T00:00:00Z')

cases = []
def case(name, want, kind=None):
    data = copy.deepcopy(base)
    if kind:
        data['solid_queue_jobs'] = [job(kind)]
        data['solid_queue_ready_executions'] = [dict(job_id=1)]
    cases.append(dict(name=name, want=want, fixtures=data))
    return data

case('empty', False)
case('order_ready', True, 'event')
d = case('order_due', True, 'event'); d['solid_queue_ready_executions'] = []; d['solid_queue_scheduled_executions'] = [dict(job_id=1, scheduled_at='2000-01-01T00:00:00Z')]
d = case('order_future', False, 'event'); d['solid_queue_ready_executions'] = []; d['solid_queue_scheduled_executions'] = [dict(job_id=1, scheduled_at='2999-01-01T00:00:00Z')]
d = case('catalog_event_ignored', False, 'event'); d['solid_queue_jobs'][0]['arguments']['arguments'][1]['name'] = 'product.updated'
d = case('foreign_store_ignored', False, 'event'); d['solid_queue_jobs'][0]['arguments']['arguments'][1]['store_id'] = '99'
d = case('pre_activation_ignored', False, 'event'); d['solid_queue_jobs'][0]['created_at'] = '2026-01-01T00:00:00Z'
d = case('finished_ignored', False, 'event'); d['solid_queue_jobs'][0]['finished_at'] = '2026-01-04T00:00:00Z'
d = case('other_subscriber_ignored', False, 'event'); d['solid_queue_jobs'][0]['arguments']['arguments'][0] = 'OtherSubscriber'
d = case('inactive_endpoint_ignored', False, 'event'); d['spree_webhook_endpoints'][0]['active'] = False
d = case('delivery_ready', True, 'delivery'); d['spree_webhook_deliveries'] = [delivery()]
d = case('delivery_foreign_endpoint_ignored', False, 'delivery'); d['spree_webhook_deliveries'] = [delivery()]; d['spree_webhook_deliveries'][0]['webhook_endpoint_id'] = 99
d = case('password_reset_delivery', True, 'delivery'); d['spree_webhook_deliveries'] = [delivery()]; d['spree_webhook_deliveries'][0]['event_name'] = 'customer.password_reset_requested'
case('payment_captured', True, 'payment')
d = case('payment_failed', True, 'payment'); d['solid_queue_jobs'][0]['arguments']['arguments'][0]['action'] = 'failed'
d = case('payment_wrong_method_ignored', False, 'payment'); d['solid_queue_jobs'][0]['arguments']['arguments'][0]['payment_method_id'] = '99'
d = case('payment_other_action_ignored', False, 'payment'); d['solid_queue_jobs'][0]['arguments']['arguments'][0]['action'] = 'other'
d = case('inactive_payment_ignored', False, 'payment'); d['spree_payment_methods'][0]['active'] = False
d = case('stale_worker', True); d['solid_queue_processes'] = [dict(kind='Worker', name='bisontcg-email-http-1', last_heartbeat_at='2000-01-01T00:00:00Z')]
d = case('fresh_worker_ignored', False); d['solid_queue_processes'] = [dict(kind='Worker', name='bisontcg-email-http-1', last_heartbeat_at='2999-01-01T00:00:00Z')]
for name, want, attempts, due, queued in [
    ('retry_due', True, 2, '2000-01-01T00:00:00Z', False),
    ('retry_limit_ignored', False, 3, '2000-01-01T00:00:00Z', False),
    ('retry_future_ignored', False, 2, '2999-01-01T00:00:00Z', False),
    ('retry_already_queued_ignored', False, 2, '2000-01-01T00:00:00Z', True),
]:
    d = case(name, want)
    d['spree_webhook_deliveries'] = [delivery()]
    d['bison_email_delivery_attempts'] = [dict(delivery_id=5, attempts=attempts,
        next_attempt_at=due, last_attempt_at='2026-01-03T00:00:00Z')]
    if queued:
        d['solid_queue_jobs'] = [job('delivery')]

fixture_ctes = ',\n'.join(
    f"{table} AS (SELECT * FROM jsonb_to_recordset(tc.fixtures->'{table}') AS x({columns}))"
    for table, columns in schemas.items())
fixture_body = body.removesuffix(';').replace('WITH endpoint AS', f'WITH {fixture_ctes},\nendpoint AS', 1)
payload = json.dumps(cases).replace("'", "''")
print("WITH test_cases AS (SELECT * FROM jsonb_to_recordset('" + payload + "'::jsonb) AS x(name text,want boolean,fixtures jsonb)), results AS (")
print('SELECT tc.name,tc.want,actual,actual IS NOT DISTINCT FROM tc.want AS pass FROM test_cases tc CROSS JOIN LATERAL (')
print(fixture_body)
print(') AS result(actual)) SELECT count(*) AS tests, count(*) FILTER (WHERE pass) AS passed,')
print('jsonb_agg(name) FILTER (WHERE NOT pass) AS failures, 1 / bool_and(pass)::integer AS assertion FROM results;')

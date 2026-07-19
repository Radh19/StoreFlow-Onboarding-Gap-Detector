-- onboarding_funnel.sql
-- Run against the warehouse (Snowflake / BigQuery / Redshift) mirror of the
-- event log, NOT against the production application database.
--
-- Source table assumed: analytics.onboarding_events
--   user_id        string
--   event_name     string   e.g. 'Signup Completed', 'Payment Connected'
--   event_ts       timestamp
--   channel        string
--   device         string
--   business_type  string
--   seller_type    string
--
-- Output shape: one row per merchant, matching the wide CSV your existing
-- pandas code (funnel_for_cohort, find_biggest_drop, evidence_tier) expects.
-- Swap this file's contents for your actual warehouse's SQL dialect as needed.

WITH step_map AS (
    SELECT * FROM (VALUES
        ('Signup Completed',        'signup',              1),
        ('Email Verified',          'verify_email',        2),
        ('Store Details Added',     'add_store_details',   3),
        ('First Product Added',     'add_first_product',   4),
        ('Payment Connected',       'connect_payment',      5),
        ('Store Launched',          'store_launched',      6)
    ) AS t(event_name, step_key, step_order)
),

user_events AS (
    SELECT
        e.user_id,
        e.channel,
        e.device,
        e.business_type,
        e.seller_type,
        s.step_key,
        s.step_order,
        e.event_ts,
        DATE_TRUNC('week', MIN(e.event_ts) OVER (PARTITION BY e.user_id)) AS cohort_week
    FROM analytics.onboarding_events e
    JOIN step_map s ON s.event_name = e.event_name
    WHERE e.event_ts >= DATEADD('week', -8, CURRENT_DATE)  -- last 8 weeks, matches N_WEEKS
),

user_progress AS (
    SELECT
        user_id,
        MAX(channel)        AS channel,
        MAX(device)         AS device,
        MAX(business_type)  AS business_type,
        MAX(seller_type)    AS seller_type,
        MAX(cohort_week)    AS cohort_week,
        MAX(step_order)     AS steps_completed,
        MIN(CASE WHEN step_order = 1 THEN event_ts END) AS signup_ts,
        MAX(CASE WHEN step_order = 6 THEN event_ts END) AS launched_ts
    FROM user_events
    GROUP BY user_id
)

SELECT
    user_id,
    channel,
    business_type,
    seller_type,
    device,
    cohort_week,
    steps_completed,
    CASE
        WHEN steps_completed = 6 THEN NULL
        ELSE (SELECT step_key FROM step_map WHERE step_order = steps_completed + 1)
    END                                                     AS dropped_at_step,
    CASE WHEN steps_completed = 6 THEN 1 ELSE 0 END          AS activated,
    CASE
        WHEN launched_ts IS NOT NULL
        THEN DATEDIFF('day', signup_ts, launched_ts)
        ELSE NULL
    END                                                     AS days_to_activate
FROM user_progress;

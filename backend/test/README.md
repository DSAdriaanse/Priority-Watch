# Backend tests

End-to-end checks of the access rules and hook routes against a real PocketBase, with fake
Textbelt, Slack, Anthropic, WordPress and Allmon3 services.

```bash
# 1. fake third-party services
node backend/test/mock-services.mjs 9100 &

# 2. PocketBase with test settings (use a throwaway data dir)
export INBOUND_WEBHOOK_SECRET=s3cret TEXTBELT_KEY=k TEXTBELT_URL=http://127.0.0.1:9100/textbelt \
  SLACK_BOT_TOKEN=x SLACK_API_URL=http://127.0.0.1:9100/slack \
  ANTHROPIC_API_KEY=a ANTHROPIC_API_URL=http://127.0.0.1:9100/anthropic \
  WORDPRESS_APP_PASSWORD=wp ALLMON_PASS=ap RATE_LIMIT_DEFAULTS=off
./pocketbase superuser upsert admin@test.local testpass1234 --dir /tmp/pwtest --migrationsDir backend/pb_migrations --hooksDir backend/pb_hooks
./pocketbase serve --dir /tmp/pwtest --migrationsDir backend/pb_migrations --hooksDir backend/pb_hooks --http 127.0.0.1:8090 &

# 3. run
node --test backend/test/api.test.mjs
```

The last test floods the webhook to prove rate limiting. The limit window is 60 seconds, so
wait a minute before running the suite a second time against the same server.

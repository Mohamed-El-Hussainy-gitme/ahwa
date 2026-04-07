Priority 1 التنفيذ:
- تثبيت realtime عبر heartbeat event فعلي (ping) بدلاً من comment-only heartbeat.
- منع polling/focus reload من العمل طالما realtime صحي.
- تخفيف auth/session churn داخل AuthzProvider مع الحفاظ على shift state عند transient failure.
- تثبيت طباعة الفاتورة في PWA عبر fallback draft storage لبيانات preview receipt.
- الحفاظ على نفس نافذة الـ PWA لصفحات الطباعة.

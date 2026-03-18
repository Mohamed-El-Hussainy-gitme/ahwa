from pathlib import Path

root = Path('/tmp/ahwa_fix')
helpers = root/'apps/web/src/app/api/ops/_helpers.ts'
text = helpers.read_text(encoding='utf-8')
needle = "export function requireSessionOrderAccess(ctx: OpsActorContext) {\n  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);\n}\n"
insert = needle + "\nexport function requireDeliveryAccess(ctx: OpsActorContext) {\n  return requireRoleAccess(ctx, ['supervisor', 'waiter', 'shisha']);\n}\n"
if "export function requireDeliveryAccess(ctx: OpsActorContext)" not in text:
    text = text.replace(needle, insert)
helpers.write_text(text, encoding='utf-8')

pd = root/'apps/web/src/app/platform/PlatformDashboardClient.tsx'
text = pd.read_text(encoding='utf-8')

# Add CreateCafeFormState type after support inbox response type.
marker = "type SupportInboxResponse = { ok: true; data: SupportInboxData | null };\n"
addition = marker + "\ntype CreateCafeFormState = {\n  cafeSlug: string;\n  cafeDisplayName: string;\n  ownerFullName: string;\n  ownerPhone: string;\n  ownerPassword: string;\n  startsAt: string;\n  endsAt: string;\n  graceDays: string;\n  status: SubscriptionStatus;\n  amountPaid: string;\n  isComplimentary: boolean;\n  notes: string;\n  databaseKey: string;\n};\n"
if "type CreateCafeFormState" not in text:
    text = text.replace(marker, addition)

# Insert missing helper block before supportStatusLabel.
marker2 = "function supportStatusLabel(status: SupportMessageStatus) {\n"
helper_block = """
function isCafeOwnerRow(value: unknown): value is CafeOwnerRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.full_name === 'string' &&
    typeof value.phone === 'string' &&
    (value.owner_label === 'owner' || value.owner_label === 'partner') &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string'
  );
}

function isCafeRow(value: unknown): value is CafeRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.display_name === 'string' &&
    typeof value.is_active === 'boolean' &&
    typeof value.created_at === 'string' &&
    (typeof value.last_activity_at === 'undefined' || typeof value.last_activity_at === 'string' || value.last_activity_at === null) &&
    (typeof value.owner_count === 'undefined' || typeof value.owner_count === 'number') &&
    (typeof value.active_owner_count === 'undefined' || typeof value.active_owner_count === 'number') &&
    (typeof value.owners === 'undefined' || (Array.isArray(value.owners) && value.owners.every(isCafeOwnerRow))) &&
    (typeof value.current_subscription === 'undefined' || value.current_subscription === null || isCafeSubscriptionRow(value.current_subscription))
  );
}

function isCreateCafeResponse(value: unknown): value is CreateCafeResponse {
  if (!isRecord(value) || value.ok !== true) return false;
  if (typeof value.data === 'undefined') return true;
  return isRecord(value.data) && (typeof value.data.cafe_id === 'undefined' || typeof value.data.cafe_id === 'string');
}

function isSupportReplyRow(value: unknown): value is SupportReplyRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.support_message_id === 'string' &&
    typeof value.author_super_admin_user_id === 'string' &&
    typeof value.reply_note === 'string' &&
    typeof value.created_at === 'string'
  );
}

function isSupportMessageRow(value: unknown): value is SupportMessageRow {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (typeof value.cafe_id === 'string' || value.cafe_id === null) &&
    (typeof value.cafe_slug_snapshot === 'string' || value.cafe_slug_snapshot === null) &&
    (typeof value.cafe_display_name_snapshot === 'string' || value.cafe_display_name_snapshot === null) &&
    typeof value.sender_name === 'string' &&
    typeof value.sender_phone === 'string' &&
    (typeof value.actor_kind === 'string' || value.actor_kind === null) &&
    (value.source === 'login' || value.source === 'in_app') &&
    (typeof value.page_path === 'string' || value.page_path === null) &&
    typeof value.issue_type === 'string' &&
    typeof value.message === 'string' &&
    (value.status === 'new' || value.status === 'in_progress' || value.status === 'closed') &&
    (value.priority === 'low' || value.priority === 'normal' || value.priority === 'high') &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    (typeof value.closed_at === 'string' || value.closed_at === null) &&
    typeof value.support_access_requested === 'boolean' &&
    (value.support_access_status === 'not_requested' || value.support_access_status === 'requested' || value.support_access_status === 'granted' || value.support_access_status === 'revoked' || value.support_access_status === 'expired') &&
    (typeof value.support_access_requested_at === 'string' || value.support_access_requested_at === null) &&
    (typeof value.support_access_granted_at === 'string' || value.support_access_granted_at === null) &&
    (typeof value.support_access_expires_at === 'string' || value.support_access_expires_at === null) &&
    (typeof value.support_access_revoked_at === 'string' || value.support_access_revoked_at === null) &&
    (typeof value.support_access_note === 'string' || value.support_access_note === null) &&
    Array.isArray(value.replies) &&
    value.replies.every(isSupportReplyRow)
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function subscriptionBadgeClass(status: SubscriptionStatus) {
  switch (status) {
    case 'trial':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
  }
}

function cafeStatusBadgeClass(active: boolean) {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

function paymentStateText(subscription: CafeSubscriptionRow | null | undefined) {
  if (!subscription) return 'بدون اشتراك';
  if (subscription.effective_status === 'suspended') return 'معلق';
  if (subscription.effective_status === 'expired') return 'منتهي';
  if (subscription.effective_status === 'trial') return subscription.is_complimentary ? 'مجاني / تجريبي' : 'تجريبي';
  return subscription.is_complimentary ? 'مجاني' : 'مدفوع';
}

function ownerLabelText(label: 'owner' | 'partner') {
  return label === 'owner' ? 'مالك' : 'شريك';
}

function applyPreset(days: number, complimentary: boolean, status: SubscriptionStatus): Pick<CreateCafeFormState, 'startsAt' | 'endsAt' | 'graceDays' | 'status' | 'amountPaid' | 'isComplimentary'> {
  const start = new Date();
  const end = new Date(start.getTime() + 1000 * 60 * 60 * 24 * days);
  return {
    startsAt: toDateInputValue(start),
    endsAt: toDateInputValue(end),
    graceDays: '0',
    status,
    amountPaid: complimentary ? '0' : '',
    isComplimentary: complimentary,
  };
}

"""
if "function applyPreset(" not in text:
    text = text.replace(marker2, helper_block + marker2)

# tighten response guards
text = text.replace(
    "function isSupportInboxResponse(value: unknown): value is SupportInboxResponse {\n  return isRecord(value) && value.ok === true && (!('data' in value) || value.data === null || isRecord(value.data));\n}\n",
    "function isSupportInboxResponse(value: unknown): value is SupportInboxResponse {\n  return (\n    isRecord(value) &&\n    value.ok === true &&\n    (value.data === null || (\n      isRecord(value.data) &&\n      isRecord(value.data.summary) &&\n      typeof value.data.summary.total === 'number' &&\n      typeof value.data.summary.new_count === 'number' &&\n      typeof value.data.summary.in_progress_count === 'number' &&\n      typeof value.data.summary.closed_count === 'number' &&\n      typeof value.data.summary.high_priority_count === 'number' &&\n      Array.isArray(value.data.items) &&\n      value.data.items.every(isSupportMessageRow)\n    ))\n  );\n}\n"
)
text = text.replace(
    "function isMoneyFollowResponse(value: unknown): value is MoneyFollowApiResponse {\n  return isRecord(value) && value.ok === true && (!('data' in value) || value.data === null || isRecord(value.data));\n}\n",
    "function isMoneyFollowResponse(value: unknown): value is MoneyFollowApiResponse {\n  return isRecord(value) && value.ok === true && (value.data === null || isRecord(value.data));\n}\n"
)

# type the state generic
text = text.replace(
    "  const [createCafe, setCreateCafe] = useState({\n",
    "  const [createCafe, setCreateCafe] = useState<CreateCafeFormState>({\n"
)

pd.write_text(text, encoding='utf-8')
print('[OK] patched files')

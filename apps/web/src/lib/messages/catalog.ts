const MESSAGE_CATALOG: Record<string, string> = {
  REQUEST_FAILED: 'تعذر إتمام الطلب الآن. حاول مرة أخرى.',
  INVALID_INPUT: 'البيانات المدخلة غير صالحة.',
  UNAUTHORIZED: 'يجب تسجيل الدخول أولًا.',
  FORBIDDEN: 'ليست لديك صلاحية تنفيذ هذا الإجراء.',
  NO_OPEN_SHIFT: 'لا توجد وردية مفتوحة الآن.',
  SHIFT_ID_REQUIRED: 'يجب تحديد الوردية أولًا.',
  SHIFT_OPEN_FAILED: 'تعذر فتح الوردية الآن.',
  SHIFT_CLOSE_FAILED: 'تعذر تقفيل الوردية الآن.',
  SHIFT_HAS_OPEN_SESSIONS: 'لا يمكن تقفيل الوردية لأن هناك جلسات ما زالت مفتوحة أو غير منتهية.',
  SHIFT_STATE_FAILED: 'تعذر تحميل حالة الوردية الحالية.',
  SHIFT_HISTORY_FAILED: 'تعذر تحميل سجل الورديات الآن.',
  SHIFT_CLOSE_SNAPSHOT_FAILED: 'تعذر إنشاء سناب شوت الوردية الآن.',
  FAILED_TO_OPEN_SHIFT: 'تعذر فتح الوردية الآن.',
  FAILED_TO_CLOSE_SHIFT: 'تعذر تقفيل الوردية الآن.',
  FAILED_TO_LOAD_SHIFT_SNAPSHOT: 'تعذر تحميل سناب شوت الوردية.',
  FAILED_TO_LOAD_SHIFT: 'تعذر تحميل بيانات الوردية.',
  FAILED_TO_LOAD_STAFF: 'تعذر تحميل قائمة الموظفين.',
  STAFF_CREATE_FAILED: 'تعذر إضافة الموظف الآن.',
  STATUS_UPDATE_FAILED: 'تعذر تحديث حالة الموظف.',
  PIN_RESET_FAILED: 'تعذر تحديث رمز PIN الآن.',
  SESSION_CLOSE_FAILED: 'تعذر إغلاق الجلسة الآن.',
  SESSION_CLOSE_BLOCKED: 'لا يمكن إغلاق الجلسة لأن بها عناصر لم تُجهز أو لم تُسلَّم أو لم تُحاسب.',
  IDEMPOTENT_REQUEST_IN_PROGRESS: 'العملية نفسها قيد التنفيذ بالفعل. انتظر لحظة.',
  IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: 'تمت إعادة استخدام نفس الطلب بشكل غير متطابق. أعد المحاولة من جديد.',
  RECOVERY_STATE_FAILED: 'تعذر تحميل حالة الاسترداد الآن.',
  RECOVERY_CLOSE_SESSION_FAILED: 'تعذر تنفيذ إجراء الاسترداد على الجلسة.',
  RECOVERY_SESSION_NOT_RECOVERABLE: 'هذه الجلسة ليست قابلة للاسترداد الآمن الآن.',
  RECOVERY_RELEASE_LOCKS_FAILED: 'تعذر تحرير الأقفال العالقة الآن.',
  RECOVERY_NO_STALE_LOCKS: 'لا توجد أقفال عالقة تحتاج إلى تحرير.',
  RECOVERY_LOCKS_RELEASED: 'تم تحرير الأقفال العالقة بنجاح.',
  RECOVERY_SESSION_CLOSED: 'تم إغلاق الجلسة القابلة للاسترداد بنجاح.',
  RECOVERY_RESYNC_COMPLETE: 'تمت إعادة مزامنة الحالة الحالية.',
  OWNER_SHIFT_CLOSE_REPLAYED: 'تمت استعادة نتيجة تقفيل الوردية السابقة.',
  another_shift_is_already_open: 'هناك وردية مفتوحة بالفعل. لا يمكن فتح وردية ثانية قبل إنهائها.',
  cannot_resume_shift_after_next_shift_started: 'لا يمكن متابعة هذه الوردية لأن الشيفت التالي بدأ بالفعل.',
  SUPERVISOR_REQUIRED: 'يجب تحديد مشرف واحد فقط قبل فتح الوردية.',
  CUSTOMERS_LOAD_FAILED: 'تعذر تحميل ملف العملاء الآن.',
  CUSTOMER_CREATE_FAILED: 'تعذر إنشاء ملف العميل الآن.',
  CUSTOMER_UPDATE_FAILED: 'تعذر تحديث ملف العميل الآن.',
  CUSTOMER_STATUS_UPDATE_FAILED: 'تعذر تحديث حالة ملف العميل.',
  CUSTOMER_PHONE_EXISTS: 'رقم الهاتف مسجل بالفعل داخل ملف عميل آخر.',
};

export function resolveMessage(value: string | null | undefined, fallback = 'تعذر إتمام الطلب الآن. حاول مرة أخرى.') {
  const normalized = String(value ?? '').trim();
  if (!normalized) return fallback;
  return MESSAGE_CATALOG[normalized] ?? normalized;
}

export function ensureCatalogMessage(code: string, message?: string | null) {
  const normalizedCode = String(code ?? '').trim();
  const normalizedMessage = String(message ?? '').trim();
  if (normalizedMessage && normalizedMessage !== normalizedCode) {
    return resolveMessage(normalizedMessage);
  }
  return resolveMessage(normalizedCode);
}

export { MESSAGE_CATALOG };

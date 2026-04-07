export const metadata = {
  title: "أوفلاين | AHWA",
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-lg font-semibold text-white">
          A
        </div>
        <h1 className="mb-2 text-2xl font-bold">أنت غير متصل بالإنترنت</h1>
        <p className="mb-4 text-sm leading-6 text-neutral-600">
          يمكن متابعة فتح بعض الصفحات التي زرتها سابقًا، لكن هذه الصفحة تحتاج اتصالًا لإحضار أحدث البيانات.
        </p>
        <p className="text-sm leading-6 text-neutral-600">
          بمجرد عودة الاتصال، أعد المحاولة أو حدّث الصفحة.
        </p>
      </div>
    </main>
  );
}

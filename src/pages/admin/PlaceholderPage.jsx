export default function PlaceholderPage({ title, description, actionLabel }) {
  return (
    <section>
      <div className="page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
        {actionLabel && <button className="primary-button" type="button">{actionLabel}</button>}
      </div>
      <div className="content-card empty-table">
        <strong>لا توجد بيانات بعد</strong>
        <span>هذه الصفحة جاهزة لربط وظائفها في الحزم التالية.</span>
      </div>
    </section>
  );
}

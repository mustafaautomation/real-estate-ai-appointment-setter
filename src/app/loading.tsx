export default function Loading() {
  return (
    <main className="page" aria-busy="true">
      <div className="skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="empty">Loading the desk.</p>
    </main>
  );
}

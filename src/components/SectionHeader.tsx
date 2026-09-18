export default function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="public-section-header">
      <p className="public-eyebrow">{eyebrow}</p>
      <div>
        <h2>{title}</h2>
        {description ? <p className="muted">{description}</p> : null}
      </div>
    </div>
  );
}

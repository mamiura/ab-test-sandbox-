import { trackAction } from './dd';

interface Props {
  variant: 'control' | 'variant';
  provider: 'datadog' | 'statsig';
}

const variants = {
  control: { label: 'Buy Now', color: '#1a73e8' },
  variant: { label: 'Complete Purchase', color: '#2e7d32' },
};

export function CheckoutButton({ variant, provider }: Props) {
  const { label, color } = variants[variant];

  function handleClick() {
    trackAction('checkout_clicked', { variant, provider });
    alert(`Order placed! (variant: ${variant}, provider: ${provider})`);
  }

  return (
    <button
      onClick={handleClick}
      style={{
        backgroundColor: color,
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '14px 32px',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'opacity 0.2s',
      }}
      onMouseOver={(e) => ((e.target as HTMLButtonElement).style.opacity = '0.85')}
      onMouseOut={(e) => ((e.target as HTMLButtonElement).style.opacity = '1')}
    >
      {label}
    </button>
  );
}

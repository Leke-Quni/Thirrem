import { useState } from 'react';

/** Stripe's published test card numbers, which work in test mode only. */
const TEST_CARDS = [
  { number: '4242 4242 4242 4242', brand: 'Visa', outcome: 'Saved straight away.' },
  { number: '5555 5555 5555 4444', brand: 'Mastercard', outcome: 'Saved straight away.' },
  { number: '4000 0025 0000 3155', brand: 'Visa', outcome: 'Asks for a bank check. Choose Complete to save it.' },
  { number: '4000 0000 0000 0002', brand: 'Visa', outcome: 'Declined, so nothing is saved.' },
];

export function TestCards() {
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const copy = async (number: string) => {
    setCopied(null);
    setFailed(false);
    try {
      await navigator.clipboard.writeText(number.replaceAll(' ', ''));
      setCopied(number);
    } catch {
      setFailed(true);
    }
  };

  return (
    <aside className="test-cards" aria-labelledby="test-cards">
      <h2 id="test-cards">Test cards</h2>
      <p className="payment-note">Copy a number into “Add a card”, with any future expiry date, any security code and any country.</p>
      <ul>
        {TEST_CARDS.map(({ number, brand, outcome }) => (
          <li key={number}>
            <span className="test-number" translate="no">
              {number}
            </span>
            <button type="button" className="btn ghost" aria-label={`Copy ${number}`} onClick={() => copy(number)}>
              {copied === number ? 'Copied' : 'Copy'}
            </button>
            <span className="test-outcome">
              <span translate="no">{brand}</span>. {outcome}
            </span>
          </li>
        ))}
      </ul>
      <p className={failed ? 'payment-note' : 'sr-only'} role="status">
        {failed ? 'Could not copy. Select the number and copy it.' : copied && `Copied ${copied}.`}
      </p>
    </aside>
  );
}

import { DemoStatusBadge } from '@thirrem/ui';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../api-base-url';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { MapIllustration } from '../components/MapIllustration';
import { ThemeToggle } from '../components/ThemeToggle';

const REAL = [
  'A map of Gjakova built from OpenStreetMap',
  'Routes calculated on real roads',
  'Ride requests that go out to nearby drivers',
  'A card payment flow in Stripe test mode',
];

const SIMULATED = [
  'Every driver and their vehicle',
  'The other riders on the road',
  'The admin who approves drivers',
  'All the money. No card is ever charged',
];

const RIDE_STEPS = [
  {
    title: 'Sign up',
    text: 'Email and password. Your account stays, even when your simulation is cleared.',
  },
  {
    title: 'Request a ride',
    text: 'Choose a pickup and drop-off by place name, or drop a pin. Pick Economy, Comfort or XL and see the fare before you confirm.',
  },
  {
    title: 'Get matched',
    text: 'Nearby simulated drivers receive your request. If nobody accepts, the search widens until someone does or the request fails.',
  },
  {
    title: 'Ride, pay and rate',
    text: 'Follow the car on the map, pay with a test card and rate your driver.',
  },
];

const AWKWARD_CASES = [
  { title: 'A driver declines', text: 'Watch the request move on to the next driver.' },
  { title: 'A rider cancels', text: 'Cancel before pickup and see how the ride closes out.' },
  { title: 'A payment fails', text: 'Trigger a declined test card and recover from it.' },
  { title: 'A driver goes offline', text: 'Lose a driver mid-search and see the match widen.' },
  { title: 'An SOS is raised', text: 'Send an alert and see it reach the admin side.' },
];

const APPS = [
  { name: 'Rider', text: 'Request rides, follow the car, pay and rate. You are here.', current: true },
  { name: 'Driver', text: 'Go online, accept simulated requests and track earnings.', current: false },
  { name: 'Admin', text: 'Approve drivers, watch the fleet on a map and review disputes.', current: false },
];

const FAQ = [
  {
    q: 'Is this a real ride-hailing service?',
    a: 'No. Thirrem is a portfolio project and a simulation. No real drivers, vehicles, rides or payments exist.',
  },
  {
    q: 'Will my card be charged?',
    a: 'No. Payments run in Stripe test mode, so nothing is ever charged. Never enter a real card number.',
  },
  {
    q: 'What do I need to sign up?',
    a: 'An email address and a password. There is no social login and no guest mode.',
  },
  {
    q: 'What happens to my data?',
    a: 'Your account is kept. Your private simulation pauses after 15 minutes without activity and is cleared after 24 hours.',
  },
  {
    q: 'Where does it take place?',
    a: 'On a map of Gjakova, Kosovo. Fares are in euros and distances in kilometres.',
  },
];

export function Landing() {
  return (
    <div className="page">
      <div className="wrap">
        <nav>
          <Logo />
          <div className="links">
            <a className="plain" href="#how">
              How it works
            </a>
            <a className="plain" href="#faq">
              Questions
            </a>
            <ThemeToggle />
            <Link className="btn ghost" to="/login">
              Log in
            </Link>
            <Link className="btn primary" to="/signup">
              Sign up
            </Link>
          </div>
        </nav>

        <header className="hero">
          <div>
            <span className="badge">
              <b /> Simulated demo. No real rides, drivers or money.
            </span>{' '}
            <DemoStatusBadge apiBaseUrl={API_BASE_URL} />
            <h1>Ride-hailing you can try alone.</h1>
            <p className="lead">
              Request a ride on a real map of Gjakova. Simulated drivers answer, take you across town and get rated. Every part of a
              ride-hailing platform, in a few minutes, with nobody on the other side.
            </p>
            <div className="cta">
              <Link className="btn primary" to="/signup">
                Create an account
              </Link>
              <Link className="btn ghost" to="/login">
                I already have an account
              </Link>
            </div>
            <p className="fine">Email and password only. No social login and no guest mode.</p>
          </div>
          <MapIllustration />
        </header>

        <section className="sec" aria-labelledby="real-title">
          <div className="sec-head">
            <h2 id="real-title">Only the people and the money are made up</h2>
            <p>Everything you touch is built the way a real platform would be. The cast and the cash are the only simulated parts.</p>
          </div>
          <div className="split">
            <div>
              <h3>Real</h3>
              <ul className="ruled">
                {REAL.map((item) => (
                  <li key={item}>
                    <span className="mark ok">
                      <Icon name="check" size={16} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Simulated</h3>
              <ul className="ruled">
                {SIMULATED.map((item) => (
                  <li key={item}>
                    <span className="mark sim">
                      <Icon name="cube" size={16} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="sec" id="how" aria-labelledby="how-title">
          <div className="sec-head">
            <h2 id="how-title">One ride, start to finish</h2>
            <p>You get your own private simulation as soon as you log in, with drivers already on the road.</p>
          </div>
          <ol className="route-steps">
            {RIDE_STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="sec" aria-labelledby="awkward-title">
          <div className="sec-split">
            <div className="sec-head">
              <h2 id="awkward-title">Break things on purpose</h2>
              <p>
                A simulation controls panel lets you force the awkward cases instead of waiting for them, then see how the platform copes.
              </p>
            </div>
            <ul className="ruled rows">
              {AWKWARD_CASES.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="sec" aria-labelledby="apps-title">
          <div className="sec-head">
            <h2 id="apps-title">Three apps, each with its own world</h2>
            <p>
              Rider, Driver and Admin are separate apps with their own sign-up and their own private simulation. They do not talk to each
              other, so you can try any one without the rest.
            </p>
          </div>
          <ul className="apps">
            {APPS.map((app) => (
              <li key={app.name} aria-current={app.current ? 'true' : undefined}>
                <h3>{app.name}</h3>
                <p>{app.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="sec" id="faq" aria-labelledby="faq-title">
          <div className="sec-split">
            <div className="sec-head">
              <h2 id="faq-title">Questions</h2>
              <p>The short answers, before you sign up.</p>
            </div>
            <div className="faq">
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Take a ride in a few minutes.</h2>
          <div className="cta">
            <Link className="btn primary" to="/signup">
              Create an account
            </Link>
            <Link className="btn ghost" to="/login">
              I already have an account
            </Link>
          </div>
        </section>

        <footer>Thirrem is a portfolio project and a simulation: no real drivers, vehicles, rides or payments exist.</footer>
      </div>
    </div>
  );
}

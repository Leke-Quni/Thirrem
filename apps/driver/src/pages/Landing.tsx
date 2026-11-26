import { Logo, ThemeToggle } from '@thirrem/ui';
import { Link } from 'react-router-dom';
import { RequestIllustration } from '../components/RequestIllustration';

const DRIVE_STEPS = [
  { title: 'Sign up', text: 'Email and password. Your Driver account is separate from the Rider app.', ready: true },
  { title: 'Add your vehicle', text: 'Register one vehicle and choose its Vehicle Type.', ready: true },
  { title: 'Get approved', text: 'A simulated Admin checks your application in about 10 seconds.', ready: true },
  { title: 'Take Ride Requests', text: 'Simulated Riders ask for rides, and you accept or decline.', ready: false },
];

const APPS = [
  { name: 'Rider', text: 'Request rides on a map of Gjakova and follow the car.', current: false },
  { name: 'Driver', text: 'Register a vehicle and get approved. Ride Requests are coming. You are here.', current: true },
  { name: 'Admin', text: 'Approve Drivers and watch the fleet. Still being built.', current: false },
];

const FAQ = [
  {
    q: 'Can I earn money here?',
    a: 'No. Thirrem is a portfolio project and a simulation. No real riders, rides or payments exist.',
  },
  {
    q: 'What can I do today?',
    a: 'Create a Driver account, register a vehicle and get approved. Ride Requests are still being built.',
  },
  {
    q: 'Can I use my Rider account?',
    a: 'No. Each app has its own accounts. You can sign up here with the same email address.',
  },
  {
    q: 'Do I need a licence or a vehicle?',
    a: 'No. Nothing is checked against a real person, document or vehicle. Do not enter real ones.',
  },
];

export function Landing() {
  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="wrap">
        <nav>
          <Logo tag="Driver" />
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

        <main id="main">
          <header className="hero">
            <div>
              <span className="badge">
                <b /> Simulated demo. No real rides, riders or money.
              </span>
              <h1>Take the wheel with nobody on board.</h1>
              <p className="lead">
                The Driver side of a ride-hailing platform set in Gjakova, built to be tried alone. Sign up, add a vehicle and get
                approved now; Ride Requests are coming next.
              </p>
              <div className="cta">
                <Link className="btn primary" to="/signup">
                  Create a Driver account
                </Link>
                <Link className="btn ghost" to="/login">
                  I already have an account
                </Link>
              </div>
              <p className="fine">Email and password only. No social login and no guest mode.</p>
            </div>
            <RequestIllustration />
          </header>

          <section className="sec" id="how" aria-labelledby="how-title">
            <div className="sec-head">
              <h2 id="how-title">
                From <span className="nowrap">sign-up</span> to the road
              </h2>
              <p>The first three steps work today. The last is being built.</p>
            </div>
            <ol className="route-steps">
              {DRIVE_STEPS.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  {!step.ready && <span className="step-soon">Coming soon</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="sec" aria-labelledby="apps-title">
            <div className="sec-head">
              <h2 id="apps-title">Three apps, each with its own world</h2>
              <p>Rider, Driver and Admin have their own sign-up and do not talk to each other, so you can try any one without the rest.</p>
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
            <h2 id="closing-title">Create your Driver account.</h2>
            <div className="cta">
              <Link className="btn primary" to="/signup">
                Create a Driver account
              </Link>
              <Link className="btn ghost" to="/login">
                I already have an account
              </Link>
            </div>
          </section>
        </main>

        <footer>Thirrem is a portfolio project and a simulation: no real drivers, vehicles, rides or payments exist.</footer>
      </div>
    </div>
  );
}

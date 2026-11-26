import type { DriveProgress } from '@thirrem/types';
import { formatDuration } from '../map/format';
import { RequestError } from '../payment/RequestError';
import { useHeldSend } from '../payment/useHeldSend';
import { type DriveTo, findRouteAgain } from './ride-request-api';

interface ArrivalStatusProps {
  progress: DriveProgress;
  /** Which point the Driver is on the way to. */
  to: DriveTo;
  /** The API is looking for the route again. */
  onRouting(): void;
}

const WORDS = {
  pickup: {
    routing: 'Finding your Driver’s route…',
    driving: 'Arriving in',
    arrived: 'Your Driver is waiting at your Pickup Point.',
    unavailable: 'There is no route to your Pickup Point yet, so your Driver is waiting and your Fare is not held. Find it again, or start a new Sandbox.',
  },
  dropoff: {
    routing: 'Finding your route…',
    driving: 'Drop-off in',
    arrived: 'You have arrived at your Drop-off Point.',
    unavailable: 'There is no route to your Drop-off Point yet, so your Driver is waiting and your Fare is not held. Find it again, or start a new Sandbox.',
  },
};

function text(progress: DriveProgress, to: DriveTo) {
  const words = WORDS[to];
  switch (progress.status) {
    case 'routing':
      return (
        <>
          <span className="spinner small" aria-hidden="true" />
          <span>{words.routing}</span>
        </>
      );
    case 'driving':
      return (
        <>
          <span>{words.driving}</span> <strong>{formatDuration(progress.etaS)}</strong>
        </>
      );
    case 'arrived':
    case 'unavailable':
      return <span>{words[progress.status]}</span>;
  }
}

/** When the Driver will get to the Pickup Point or the Drop-off Point, or why that is not known. */
export function ArrivalStatus({ progress, to, onRouting }: ArrivalStatusProps) {
  const { pending, verifying, error, run } = useHeldSend();

  const retry = () => run((holdId) => findRouteAgain(to, holdId), onRouting, 'The route could not be asked for. Please try again.');

  return (
    <div className="arrival-block">
      <div className={`arrival is-${progress.status}`} role="status">
        {text(progress, to)}
      </div>
      {progress.status === 'unavailable' && (
        <>
          <button type="button" className="btn primary" aria-disabled={pending} onClick={retry}>
            {pending && <span className="spinner small" aria-hidden="true" />}
            {verifying ? 'Checking with your bank…' : 'Find the route again'}
          </button>
          <RequestError failure={error} />
        </>
      )}
    </div>
  );
}

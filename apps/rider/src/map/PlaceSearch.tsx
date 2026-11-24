import type { Coordinate, PlaceResult } from '@thirrem/types';
import { useId, useState } from 'react';
import { usePlaceSearch } from './usePlaceSearch';

interface PlaceSearchProps {
  label: string;
  value: string;
  near: Coordinate | null;
  disabled: boolean;
  onFocus(): void;
  onChoose(place: PlaceResult): void;
}

export function PlaceSearch({ label, value, near, disabled, onFocus, onChoose }: PlaceSearchProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? '';
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const id = useId();
  const listId = `${id}-list`;
  const search = usePlaceSearch(query, near);
  const places = search.status === 'ready' ? search.places : [];
  const showPanel = open && query.trim().length >= 3;

  const choose = (place: PlaceResult) => {
    onChoose(place);
    setDraft(null);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'ArrowDown' && places.length) {
      event.preventDefault();
      setOpen(true);
      setHighlighted((index) => (index + 1) % places.length);
    } else if (event.key === 'ArrowUp' && places.length) {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + places.length) % places.length);
    } else if (event.key === 'Enter' && showPanel && places[highlighted]) {
      event.preventDefault();
      choose(places[highlighted]);
    }
  };

  return (
    <div className="place-search">
      <input
        type="search"
        name={`${id}-place`}
        className="place-input"
        role="combobox"
        aria-label={`Search for the ${label}`}
        aria-expanded={showPanel && places.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && places[highlighted] ? `${id}-option-${highlighted}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search a street or place…"
        value={draft ?? value}
        disabled={disabled}
        onFocus={(event) => {
          onFocus();
          event.target.select();
        }}
        onBlur={() =>
          window.setTimeout(() => {
            setOpen(false);
            setDraft(null);
          }, 120)
        }
        onChange={(event) => {
          setDraft(event.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {showPanel && (
        <div className="place-panel">
          {places.length > 0 && (
            <ul id={listId} role="listbox" aria-label={`Places for the ${label}`}>
              {places.map((place, index) => (
                <li
                  key={`${place.lat},${place.lon},${place.name}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === highlighted}
                  className={index === highlighted ? 'is-highlighted' : undefined}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(place);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                >
                  <strong>{place.name}</strong>
                  {place.detail && <span>{place.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="place-status" role="status">
            {search.status === 'loading' && 'Searching…'}
            {search.status === 'error' && search.message}
            {search.status === 'ready' && places.length === 0 && 'No streets or places match. Click the map to drop a pin instead.'}
          </p>
        </div>
      )}
    </div>
  );
}

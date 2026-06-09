import { OpenFeature } from '@openfeature/web-sdk';
import { datadogRum } from '@datadog/browser-rum';
import { identifyUser } from './analytics';

const USERS = [
  { id: 'user-001', name: 'Alice' },
  { id: 'user-002', name: 'Bob' },
  { id: 'user-003', name: 'Carol' },
  { id: 'user-004', name: 'David' },
  { id: 'user-005', name: 'Eve' },
  { id: 'user-010', name: 'Frank' },
  { id: 'user-020', name: 'Grace' },
  { id: 'user-050', name: 'Heidi' },
];

interface Props {
  currentUserId: string;
  onChange: (userId: string) => void;
}

export function UserSwitcher({ currentUserId, onChange }: Props) {
  function switchUser(userId: string, name: string) {
    // Update RUM identity
    datadogRum.setUser({ id: userId, name });
    // Update OpenFeature targeting key so flag re-evaluates for the new user
    OpenFeature.setContext({ targetingKey: userId });
    identifyUser(userId, name);
    onChange(userId);
  }

  return (
    <div className="user-switcher">
      <span className="user-switcher-label">Simulate user:</span>
      <div className="user-switcher-list">
        {USERS.map(({ id, name }) => (
          <button
            key={id}
            className={`user-btn ${currentUserId === id ? 'active' : ''}`}
            onClick={() => switchUser(id, name)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

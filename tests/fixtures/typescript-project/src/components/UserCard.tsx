import React, { useState, useEffect, useCallback } from 'react';

interface UserCardProps {
  userId: string;
  showAvatar?: boolean;
  onSelect?: (id: string) => void;
}

interface UserData {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export function useUser(id: string) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      try {
        setLoading(true);
        const response = await fetch(`/api/users/${id}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch user: ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setUser(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUser();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { user, loading, error };
}

const Avatar: React.FC<{ url: string; alt: string; size?: number }> = ({
  url,
  alt,
  size = 40,
}) => {
  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      style={{ borderRadius: '50%' }}
    />
  );
};

export const UserCard: React.FC<UserCardProps> = ({
  userId,
  showAvatar = true,
  onSelect,
}) => {
  const { user, loading, error } = useUser(userId);

  const handleClick = useCallback(() => {
    if (onSelect && user) {
      onSelect(user.id);
    }
  }, [onSelect, user]);

  if (loading) {
    return <div className="user-card user-card--loading">Loading...</div>;
  }

  if (error || !user) {
    return <div className="user-card user-card--error">User not found</div>;
  }

  return (
    <div className="user-card" onClick={handleClick} role="button" tabIndex={0}>
      {showAvatar && <Avatar url={user.avatarUrl} alt={user.name} />}
      <div className="user-card__info">
        <h3 className="user-card__name">{user.name}</h3>
        <p className="user-card__email">{user.email}</p>
      </div>
    </div>
  );
};

export default UserCard;

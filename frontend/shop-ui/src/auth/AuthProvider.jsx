import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import keycloak from './keycloak.js';
import { setAccessTokenProvider, clearAccessTokenProvider } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState(null);

  const syncAuthState = useCallback(() => {
    setAuthenticated(Boolean(keycloak.authenticated));
    setToken(keycloak.token || null);

    if (keycloak.tokenParsed) {
      setProfile({
        username: keycloak.tokenParsed.preferred_username,
        email: keycloak.tokenParsed.email,
        roles: keycloak.tokenParsed.realm_access?.roles || [],
      });
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    keycloak
      .init({
        // onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then(() => {
        if (!mounted) return;
        syncAuthState();
        setInitialized(true);
      })
      .catch((error) => {
        if (!mounted) return;
        setAuthError(error?.message || 'Keycloak initialization failed');
        setInitialized(true);
      });

    return () => {
      mounted = false;
    };
  }, [syncAuthState]);

  useEffect(() => {
    setAccessTokenProvider(() => keycloak.token || token || null);

    return () => {
      clearAccessTokenProvider();
    };
  }, [token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!keycloak.authenticated) return;

      keycloak
        .updateToken(30)
        .then((refreshed) => {
          if (refreshed) {
            syncAuthState();
          }
        })
        .catch(() => {
          setToken(null);
          setAuthenticated(false);
          setProfile(null);
        });
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [syncAuthState]);

  const login = useCallback(() => {
    keycloak.login();
  }, []);

  const logout = useCallback(() => {
    keycloak.logout({
      redirectUri: window.location.origin,
    });
  }, []);

  const value = useMemo(
    () => ({
      initialized,
      authenticated,
      token,
      profile,
      authError,
      login,
      logout,
    }),
    [initialized, authenticated, token, profile, authError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
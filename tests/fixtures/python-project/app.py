"""Application module for the web service."""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from pathlib import Path

from .base import BaseApp
from .middleware import CORSMiddleware, AuthMiddleware

__all__ = [
    'Application',
    'AppConfig',
    'create_app',
    'setup_logging',
]

logger = logging.getLogger(__name__)


@dataclass
class AppConfig:
    """Configuration for the application."""
    host: str = '0.0.0.0'
    port: int = 8000
    debug: bool = False
    secret_key: str = ''
    allowed_origins: List[str] = field(default_factory=list)
    database_url: str = 'sqlite:///app.db'


class Application(BaseApp):
    """Main application class that handles routing and middleware."""

    _instance: Optional[Application] = None

    def __init__(self, config: AppConfig) -> None:
        super().__init__()
        self._config = config
        self._routes: Dict[str, Any] = {}
        self._middleware: List[Any] = []
        self._started = False

    @property
    def config(self) -> AppConfig:
        """Return the application configuration."""
        return self._config

    @property
    def is_running(self) -> bool:
        """Check if the application is currently running."""
        return self._started

    @staticmethod
    def get_version() -> str:
        """Return the current application version."""
        return '2.1.0'

    @classmethod
    def create_default(cls) -> Application:
        """Create an application instance with default configuration."""
        config = AppConfig(
            secret_key=os.environ.get('APP_SECRET', 'dev-secret'),
            debug=os.environ.get('APP_DEBUG', 'false').lower() == 'true',
        )
        return cls(config)

    def add_route(self, path: str, handler: Any, methods: Optional[List[str]] = None) -> None:
        """Register a route with the application."""
        if methods is None:
            methods = ['GET']
        self._routes[path] = {
            'handler': handler,
            'methods': methods,
        }
        logger.info('Registered route: %s %s', methods, path)

    def use(self, middleware: Any) -> None:
        """Add middleware to the application pipeline."""
        self._middleware.append(middleware)

    async def start(self) -> None:
        """Start the application server."""
        if self._started:
            raise RuntimeError('Application is already running')

        self.use(CORSMiddleware(self._config.allowed_origins))
        self.use(AuthMiddleware(self._config.secret_key))

        self._started = True
        logger.info(
            'Application started on %s:%d (debug=%s)',
            self._config.host,
            self._config.port,
            self._config.debug,
        )

    async def stop(self) -> None:
        """Stop the application server."""
        self._started = False
        logger.info('Application stopped')

    def _resolve_handler(self, path: str, method: str) -> Optional[Any]:
        """Resolve the handler for a given path and method."""
        route = self._routes.get(path)
        if route and method in route['methods']:
            return route['handler']
        return None


def create_app(config: Optional[AppConfig] = None) -> Application:
    """Factory function to create a new Application instance.

    Args:
        config: Optional configuration. Uses defaults if not provided.

    Returns:
        A configured Application instance.
    """
    if config is None:
        config = AppConfig()
    app = Application(config)
    return app


def setup_logging(level: str = 'INFO', log_file: Optional[Path] = None) -> None:
    """Configure the application logging.

    Args:
        level: The logging level as a string.
        log_file: Optional path to a log file.
    """
    handlers: List[logging.Handler] = [logging.StreamHandler()]
    if log_file:
        handlers.append(logging.FileHandler(str(log_file)))

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=handlers,
    )

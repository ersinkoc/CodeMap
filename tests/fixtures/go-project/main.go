package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"time"
)

// Handler defines the interface for request handlers.
type Handler interface {
	ServeHTTP(w http.ResponseWriter, r *http.Request)
	Pattern() string
}

// Config holds server configuration.
type Config struct {
	Host         string
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// Server represents an HTTP server with graceful shutdown support.
type Server struct {
	config     Config
	httpServer *http.Server
	handlers   []Handler
	mu         sync.RWMutex
	logger     *log.Logger
	running    bool
}

// NewServer creates a new Server instance with the given configuration.
func NewServer(config Config) *Server {
	if config.Port == 0 {
		config.Port = 8080
	}
	if config.ReadTimeout == 0 {
		config.ReadTimeout = 15 * time.Second
	}
	if config.WriteTimeout == 0 {
		config.WriteTimeout = 15 * time.Second
	}

	return &Server{
		config:   config,
		handlers: make([]Handler, 0),
		logger:   log.New(os.Stdout, "[server] ", log.LstdFlags|log.Lshortfile),
	}
}

// Register adds a handler to the server.
func (s *Server) Register(h Handler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers = append(s.handlers, h)
}

// Start begins listening for incoming connections.
func (s *Server) Start() error {
	s.mu.Lock()

	mux := http.NewServeMux()
	for _, h := range s.handlers {
		mux.Handle(h.Pattern(), h)
	}

	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
	s.httpServer = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  s.config.ReadTimeout,
		WriteTimeout: s.config.WriteTimeout,
	}

	s.running = true
	s.mu.Unlock()

	s.logger.Printf("Starting server on %s", addr)
	return s.httpServer.ListenAndServe()
}

// Stop gracefully shuts down the server.
func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return nil
	}

	s.logger.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	s.running = false
	return s.httpServer.Shutdown(ctx)
}

// HandleRequest processes an incoming HTTP request and writes a response.
func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	s.logger.Printf("%s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok","path":"%s"}`, r.URL.Path)
}

func main() {
	config := Config{
		Host: "0.0.0.0",
		Port: 8080,
	}

	server := NewServer(config)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)

	go func() {
		if err := server.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	if err := server.Stop(); err != nil {
		log.Fatalf("Shutdown error: %v", err)
	}
}

package com.example.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.validation.Valid;
import javax.validation.constraints.NotNull;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Priority levels for user notifications.
 */
public enum NotificationPriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

/**
 * Interface for repository operations.
 */
public interface UserRepository {
    Optional<User> findById(String id);
    List<User> findAll();
    User save(User user);
    void deleteById(String id);
    boolean existsByEmail(String email);
}

/**
 * Service class responsible for user management operations.
 */
@Service
@Transactional
public class UserService {

    private final UserRepository repository;
    private final ConcurrentHashMap<String, User> cache;

    public UserService(UserRepository repository) {
        this.repository = repository;
        this.cache = new ConcurrentHashMap<>();
    }

    /**
     * Retrieve a user by their unique identifier.
     *
     * @param id the user ID
     * @return an Optional containing the user if found
     */
    public Optional<User> getById(@NotNull String id) {
        User cached = cache.get(id);
        if (cached != null) {
            return Optional.of(cached);
        }

        Optional<User> user = repository.findById(id);
        user.ifPresent(u -> cache.put(id, u));
        return user;
    }

    /**
     * Create a new user from the provided input.
     *
     * @param input the user creation data
     * @return the created user
     * @throws IllegalArgumentException if the email is already in use
     */
    public User create(@Valid CreateUserInput input) {
        if (repository.existsByEmail(input.getEmail())) {
            throw new IllegalArgumentException("Email already in use: " + input.getEmail());
        }

        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName(input.getName());
        user.setEmail(input.getEmail());
        user.setRole(input.getRole() != null ? input.getRole() : "viewer");
        user.setCreatedAt(LocalDateTime.now());

        User saved = repository.save(user);
        cache.put(saved.getId(), saved);
        return saved;
    }

    /**
     * Retrieve all users.
     *
     * @return list of all users
     */
    public List<User> getAll() {
        return repository.findAll();
    }

    /**
     * Delete a user by their ID.
     *
     * @param id the user ID
     */
    public void delete(@NotNull String id) {
        repository.deleteById(id);
        cache.remove(id);
    }

    /**
     * @deprecated Use {@link #getById(String)} instead.
     */
    @Deprecated
    public User findUser(String id) {
        return getById(id).orElse(null);
    }

    @Override
    public String toString() {
        return "UserService{cacheSize=" + cache.size() + "}";
    }

    private void validateEmail(String email) {
        if (email == null || !email.contains("@")) {
            throw new IllegalArgumentException("Invalid email: " + email);
        }
    }
}

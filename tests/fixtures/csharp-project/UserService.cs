using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace CodeMap.Tests.Fixtures.Models
{
    /// <summary>
    /// Represents a user in the system.
    /// </summary>
    public record UserRecord(string Id, string Name, string Email, DateTime CreatedAt);

    /// <summary>
    /// Interface for user service operations.
    /// </summary>
    public interface IUserService
    {
        Task<User?> GetByIdAsync(string id);
        Task<User> CreateAsync(CreateUserInput input);
        Task<IEnumerable<User>> GetAllAsync();
        Task DeleteAsync(string id);
    }

    /// <summary>
    /// Represents a user entity.
    /// </summary>
    public class User
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = "viewer";
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public bool IsActive { get; set; } = true;
    }

    /// <summary>
    /// Input model for creating a new user.
    /// </summary>
    public class CreateUserInput
    {
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? Role { get; set; }
    }

    /// <summary>
    /// Service for managing user operations.
    /// </summary>
    [ServiceLifetime(ServiceLifetime.Scoped)]
    public class UserService : IUserService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<UserService> _logger;

        public UserService(AppDbContext context, ILogger<UserService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Retrieves a user by their unique identifier.
        /// </summary>
        public async Task<User?> GetByIdAsync(string id)
        {
            _logger.LogDebug("Fetching user with ID: {Id}", id);
            return await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == id);
        }

        /// <summary>
        /// Creates a new user from the provided input.
        /// </summary>
        public async Task<User> CreateAsync(CreateUserInput input)
        {
            ValidateInput(input);

            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Name = input.Name,
                Email = input.Email,
                Role = input.Role ?? "viewer",
                CreatedAt = DateTime.UtcNow,
                IsActive = true,
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created user {Id} with email {Email}", user.Id, user.Email);
            return user;
        }

        /// <summary>
        /// Retrieves all active users.
        /// </summary>
        public async Task<IEnumerable<User>> GetAllAsync()
        {
            return await _context.Users
                .Where(u => u.IsActive)
                .OrderBy(u => u.Name)
                .ToListAsync();
        }

        /// <summary>
        /// Soft-deletes a user by marking them as inactive.
        /// </summary>
        public async Task DeleteAsync(string id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
            {
                throw new KeyNotFoundException($"User with ID '{id}' not found.");
            }

            user.IsActive = false;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Soft-deleted user {Id}", id);
        }

        private static void ValidateInput(CreateUserInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Name))
            {
                throw new ArgumentException("Name is required.", nameof(input));
            }

            if (string.IsNullOrWhiteSpace(input.Email) || !input.Email.Contains('@'))
            {
                throw new ArgumentException("A valid email is required.", nameof(input));
            }
        }

        protected virtual void OnUserCreated(User user)
        {
            // Hook for derived classes
        }
    }
}

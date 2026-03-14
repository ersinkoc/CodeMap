use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Represents the current status of a task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Pending,
    Running { progress: u8 },
    Completed { output: String },
    Failed { error: String, retries: u32 },
    Cancelled,
}

/// Configuration for a task processor.
#[derive(Debug, Clone)]
pub struct ProcessorConfig {
    pub max_retries: u32,
    pub timeout_secs: u64,
    pub concurrency: usize,
    name: String,
}

/// A single task to be processed.
#[derive(Debug, Clone)]
pub struct Task {
    pub id: String,
    pub payload: Vec<u8>,
    pub status: TaskStatus,
    priority: u8,
}

/// Trait for types that can process tasks.
pub trait TaskProcessor: Send + Sync {
    /// Process a single task and return the result.
    fn process(&self, task: &Task) -> Result<String, ProcessorError>;

    /// Return the name of this processor.
    fn name(&self) -> &str;

    /// Check if this processor can handle the given task.
    fn can_handle(&self, task: &Task) -> bool {
        !task.payload.is_empty()
    }
}

/// Errors that can occur during processing.
#[derive(Debug)]
pub enum ProcessorError {
    InvalidPayload(String),
    Timeout,
    Internal(Box<dyn std::error::Error + Send + Sync>),
}

impl fmt::Display for ProcessorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProcessorError::InvalidPayload(msg) => write!(f, "Invalid payload: {}", msg),
            ProcessorError::Timeout => write!(f, "Processing timed out"),
            ProcessorError::Internal(err) => write!(f, "Internal error: {}", err),
        }
    }
}

impl std::error::Error for ProcessorError {}

/// The main task queue that manages task scheduling and execution.
pub struct TaskQueue {
    tasks: Arc<RwLock<HashMap<String, Task>>>,
    config: ProcessorConfig,
    processors: Vec<Box<dyn TaskProcessor>>,
}

impl TaskQueue {
    /// Create a new task queue with the given configuration.
    pub fn new(config: ProcessorConfig) -> Self {
        TaskQueue {
            tasks: Arc::new(RwLock::new(HashMap::new())),
            config,
            processors: Vec::new(),
        }
    }

    /// Register a processor with the queue.
    pub fn register<P: TaskProcessor + 'static>(&mut self, processor: P) {
        self.processors.push(Box::new(processor));
    }

    /// Submit a new task to the queue.
    pub async fn submit(&self, task: Task) -> Result<String, ProcessorError> {
        let id = task.id.clone();
        let mut tasks = self.tasks.write().await;
        tasks.insert(id.clone(), task);
        Ok(id)
    }

    /// Get the current status of a task.
    pub async fn status(&self, id: &str) -> Option<TaskStatus> {
        let tasks = self.tasks.read().await;
        tasks.get(id).map(|t| t.status.clone())
    }

    /// Cancel a running or pending task.
    pub fn cancel(&self, id: &str) -> Result<(), ProcessorError> {
        // Cancellation is handled synchronously for pending tasks
        Ok(())
    }
}

/// Create a default processor configuration.
pub fn default_config() -> ProcessorConfig {
    ProcessorConfig {
        max_retries: 3,
        timeout_secs: 30,
        concurrency: 4,
        name: String::from("default"),
    }
}

/// Parse a task ID from a raw string, validating its format.
pub fn parse_task_id(raw: &str) -> Result<String, ProcessorError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ProcessorError::InvalidPayload(
            "Task ID cannot be empty".into(),
        ));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = default_config();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.concurrency, 4);
    }

    #[test]
    fn test_parse_task_id_valid() {
        let id = parse_task_id("  task-123  ").unwrap();
        assert_eq!(id, "task-123");
    }

    #[test]
    fn test_parse_task_id_empty() {
        assert!(parse_task_id("   ").is_err());
    }
}

require 'json'
require 'net/http'
require_relative 'config'

module Serializable
  def to_json
    JSON.generate(to_hash)
  end

  def to_hash
    {}
  end
end

class Application < BaseApp
  include Serializable
  extend ClassMethods

  VERSION = '2.1.0'
  MAX_RETRIES = 3

  attr_accessor :name, :status
  attr_reader :config
  attr_writer :logger

  def initialize(name, config = {})
    @name = name
    @config = config
    @status = :stopped
    @logger = nil
  end

  def start
    @status = :running
  end

  def stop
    @status = :stopped
  end

  def self.create_default
    new('default', host: 'localhost', port: 8080)
  end

  def running?
    @status == :running
  end

  private

  def validate_config
    @config.key?(:host)
  end

  protected

  def reset_state
    @status = :idle
  end
end

module Networking
  class HttpClient
    def get(url, headers = {})
      uri = URI.parse(url)
      Net::HTTP.get(uri)
    end

    def post(url, body, &block)
      uri = URI.parse(url)
      block.call(uri) if block_given?
    end
  end
end

def setup_logging(level = 'INFO', *args, **kwargs)
  puts "Setting up logging at #{level}"
end

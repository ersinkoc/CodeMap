import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart' show Widget, BuildContext;

export 'src/models.dart';

typedef StringCallback = void Function(String value);
typedef JsonMap = Map<String, dynamic>;

const String appName = 'MyApp';
final int maxRetries = 3;

enum Status {
  idle,
  loading,
  success,
  error,
}

abstract class BaseService {
  String get name;
  Future<void> initialize();
}

class AppConfig {
  final String host;
  final int port;
  final bool debug;

  AppConfig({required this.host, this.port = 8080, this.debug = false});

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      host: json['host'] as String,
      port: json['port'] as int? ?? 8080,
      debug: json['debug'] as bool? ?? false,
    );
  }

  AppConfig.defaultConfig() : host = 'localhost', port = 8080, debug = false;
}

class ApiService extends BaseService with Serializable implements Disposable {
  final AppConfig _config;
  late final HttpClient _client;
  var _status = Status.idle;

  @override
  String get name => 'ApiService';

  ApiService(this._config);

  @override
  Future<void> initialize() async {
    _status = Status.loading;
  }

  Future<Map<String, dynamic>> fetchData(String endpoint) async {
    final url = '${_config.host}:${_config.port}/$endpoint';
    return {'url': url};
  }

  static ApiService create(AppConfig config) {
    return ApiService(config);
  }

  void _internalMethod() {
    // private
  }

  void dispose() {
    _status = Status.idle;
  }
}

mixin Serializable on BaseService {
  Map<String, dynamic> toJson() {
    return {'name': name};
  }
}

extension StringExtension on String {
  String capitalize() {
    if (isEmpty) return this;
    return '${this[0].toUpperCase()}${substring(1)}';
  }

  bool get isBlank => trim().isEmpty;
}

Future<void> main() async {
  final config = AppConfig(host: 'localhost', port: 3000);
  final service = ApiService(config);
  await service.initialize();
}

void _privateHelper() {
  // not exported
}

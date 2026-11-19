package com.remotefalcon.controlpanel.configuration;

import com.mongodb.client.MongoClient;
import org.springframework.data.mongodb.core.MongoTemplate;

/**
 * The Mongo client and template reserved for scheduled maintenance work (the
 * nightly retention sweep, the document-size alarm, the FPP_HEALTH sweeps and
 * the startup index build). See {@link MaintenanceMongoConfig} for why it
 * exists and how it differs from the request-path client.
 *
 * <p>Deliberately NOT a {@link MongoClient} or {@link MongoTemplate} bean:
 * Spring Boot's Mongo auto-configuration backs off when either type is already
 * present ({@code @ConditionalOnMissingBean}), which would silently replace the
 * request-path client and template with these. Wrapping them keeps the
 * auto-configured request-path beans as the only ones of their type.
 */
public class MaintenanceMongo implements AutoCloseable {

  private final MongoClient client;
  private final MongoTemplate template;

  public MaintenanceMongo(MongoClient client, MongoTemplate template) {
    this.client = client;
    this.template = template;
  }

  public MongoTemplate template() {
    return template;
  }

  MongoClient client() {
    return client;
  }

  @Override
  public void close() {
    client.close();
  }
}

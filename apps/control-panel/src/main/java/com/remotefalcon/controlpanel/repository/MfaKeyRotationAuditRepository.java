package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.controlpanel.document.MfaKeyRotationAudit;
import org.springframework.data.mongodb.repository.MongoRepository;

/**
 * Persists {@link MfaKeyRotationAudit} records. Declaring it as a Spring Data
 * repository (rather than writing via MongoTemplate ad hoc) also registers the
 * entity as a managed domain type, so Spring AOT emits the reflection metadata
 * the GraalVM native image needs to map it (cf. issue #160 native traps).
 */
public interface MfaKeyRotationAuditRepository extends MongoRepository<MfaKeyRotationAudit, String> {
}

package com.remotefalcon.controlpanel.repository;

import com.remotefalcon.library.documents.Notification;
import com.remotefalcon.library.enums.NotificationType;
import jakarta.transaction.Transactional;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface NotificationRepository extends MongoRepository<Notification, String> {

    @Transactional
    void deleteByUuid(String uuid);

    Optional<Notification> findByUuid(String uuid);

    Page<Notification> findByTypeOrderByCreatedDateDesc(NotificationType type, Pageable pageable);
}

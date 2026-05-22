package com.remotefalcon.library.models;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;
import com.remotefalcon.library.enums.NotificationType;

@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationModel {
  private String uuid;
  private LocalDateTime createdDate;
  private NotificationType type;
  private String preview;
  private String subject;
  private String message;
  private String link;
}

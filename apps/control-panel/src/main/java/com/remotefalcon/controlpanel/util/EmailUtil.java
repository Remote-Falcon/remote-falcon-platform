package com.remotefalcon.controlpanel.util;

import com.mailersend.sdk.emails.Email;
import com.mailersend.sdk.MailerSend;
import com.mailersend.sdk.MailerSendResponse;
import com.mailersend.sdk.exceptions.MailerSendException;
import com.remotefalcon.library.documents.Show;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;


@Component
@Slf4j
public class EmailUtil {

  @Value("${sendgrid.key}")
  String sendgridKey;

  @Value("${web.url}")
  String webUrl;

  @Value("${mailersend.template-ids.sign-up}")
  String signUpTemplateId;

  @Value("${mailersend.template-ids.forgot-password}")
  String forgotPasswordTemplateId;

  @Value("${mailersend.template-ids.request-api-access}")
  String requestApiAccessTemplateId;

  @Value("${mailer.dev-bypass:false}")
  Boolean mailerDevBypass;

  public MailerSendResponse sendSignUpEmail(Show show) {
    Email email = new Email();
    email.addRecipient(show.getShowName(), show.getEmail());

    email.setTemplateId(signUpTemplateId);
    email.setSubject("Welcome to Remote Falcon!");
    email.AddVariable("showName", show.getShowName());
    email.AddVariable("verifyEmailLink", String.format("%s/verifyEmail/%s/%s", webUrl, show.getShowToken(), show.getShowSubdomain()));
    return sendEmail(email);
  }

  public MailerSendResponse sendForgotPasswordEmail(Show show, String passwordResetLink) {
    Email email = new Email();
    email.addRecipient(show.getShowName(), show.getEmail());
    email.setTemplateId(forgotPasswordTemplateId);
    email.setSubject("You forgot your password, huh?");
    email.AddVariable("resetPasswordLink", String.format("%s/resetPassword/%s", webUrl, passwordResetLink));
    return sendEmail(email);
  }

  public MailerSendResponse sendRequestApiAccessEmail(Show show, String apiAccessToken, String apiAccessSecret) {
    Email email = new Email();
    email.addRecipient(show.getShowName(), show.getEmail());
    email.setTemplateId(requestApiAccessTemplateId);
    email.setSubject("Let's Get Coding!");
    email.AddVariable("accessToken", apiAccessToken);
    email.AddVariable("secretKey", apiAccessSecret);
    return sendEmail(email);
  }

  private MailerSendResponse sendEmail(Email email) {
    MailerSendResponse response = new MailerSendResponse();
    email.setFrom("Remote Falcon", "noreply@remotefalcon.com");

    if (Boolean.TRUE.equals(mailerDevBypass)) {
      log.info("MAILER_DEV_BYPASS enabled — skipping outbound send and returning synthetic 202");
      response.responseStatusCode = 202;
      return response;
    }

    MailerSend ms = new MailerSend();

    ms.setToken(sendgridKey);

    try {
      response = ms.emails().send(email);
    } catch (MailerSendException e) {
      log.error(
          "Error sending email (code={}, message={}, responseBody={}, errors={})",
          e.code,
          e.message,
          e.responseBody,
          e.errors,
          e
      );
      response.responseStatusCode = e.code > 0 ? e.code : 500;
    }
    return response;
  }
}

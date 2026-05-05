package com.remotefalcon.controlpanel.service;

import com.remotefalcon.controlpanel.model.S3Image;
import com.remotefalcon.controlpanel.util.S3Util;
import com.remotefalcon.controlpanel.repository.ShowRepository;
import com.remotefalcon.controlpanel.response.GitHubIssueResponse;
import com.remotefalcon.controlpanel.util.AuthUtil;
import com.remotefalcon.library.documents.Show;
import com.remotefalcon.library.enums.StatusResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ControlPanelService {
  private final RestTemplate gitHubRestTemplate;
  private final AuthUtil authUtil;
  private final ShowRepository showRepository;

  private final S3Util s3Util;

  public ResponseEntity<List<GitHubIssueResponse>> gitHubIssues() {
    ResponseEntity<List<GitHubIssueResponse>> responseEntity = this.gitHubRestTemplate.exchange(
            "/repos/Remote-Falcon/remote-falcon-issue-tracker/issues",
            HttpMethod.GET,
            null,
            new ParameterizedTypeReference<List<GitHubIssueResponse>>() {});
    List<GitHubIssueResponse> ghIssue = responseEntity.getBody();
    if(CollectionUtils.isNotEmpty(ghIssue)) {
      ghIssue.forEach(issue -> {
        boolean isBug = issue.getLabels().stream().anyMatch(label -> StringUtils.equalsIgnoreCase("bug", label.getName()));
        issue.setType(isBug ? "bug" : "enhancement");
      });
    }
    return ResponseEntity.ok(ghIssue);
  }

  public ResponseEntity<String> getJwt() {
    String[] basicAuthCredentials = this.authUtil.getBasicAuthCredentials(this.authUtil.getCurrentRequest());
    if (basicAuthCredentials != null) {
      String email = basicAuthCredentials[0];
      String password = basicAuthCredentials[1];
      Optional<Show> optionalShow = this.showRepository.findByEmailCollation(email);
      if (optionalShow.isEmpty()) {
        throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
      }
      Show show = optionalShow.get();
      BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
      boolean passwordsMatch = passwordEncoder.matches(password, show.getPassword());
      if (passwordsMatch) {
        if (!show.getEmailVerified()) {
          throw new RuntimeException(StatusResponse.EMAIL_NOT_VERIFIED.name());
        }
        String jwt = this.authUtil.signJwt(show);
        return ResponseEntity.ok(jwt);
      }
    }
    throw new RuntimeException(StatusResponse.UNAUTHORIZED.name());
  }

  public ResponseEntity<String> uploadImage(MultipartFile file) {
    Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
    if(show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    String imageValidation = this.validateImage(file);
    if(imageValidation != null) {
      return ResponseEntity.badRequest().body(imageValidation);
    }

    return s3Util.uploadFile(file, show.get().getShowSubdomain());
  }

  private String validateImage(MultipartFile file) {
    if(!StringUtils.contains(file.getContentType(), "image")) {
      return "File must be an image";
    }
    return null;
  }

  public ResponseEntity<Boolean> downloadImage(String image) {
    Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
    if(show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    Boolean success = s3Util.downloadFile(image, show.get().getShowSubdomain());

    return ResponseEntity.ok(success);
  }

  public ResponseEntity<String> deleteImage(String image) {
    Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
    if(show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    s3Util.deleteFile(image, show.get().getShowSubdomain());

    return ResponseEntity.ok(image);
  }

  public ResponseEntity<List<S3Image>> getImages() {
    Optional<Show> show = this.showRepository.findByShowToken(authUtil.getTokenDTO().getShowToken());
    if(show.isEmpty()) {
      throw new RuntimeException(StatusResponse.SHOW_NOT_FOUND.name());
    }

    return ResponseEntity.ok(s3Util.getImages(show.get().getShowSubdomain()));
  }
}

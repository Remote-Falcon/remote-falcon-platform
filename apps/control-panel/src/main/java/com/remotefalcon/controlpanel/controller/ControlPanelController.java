package com.remotefalcon.controlpanel.controller;

import com.remotefalcon.controlpanel.aop.RequiresAccess;
import com.remotefalcon.controlpanel.model.S3Image;
import com.remotefalcon.controlpanel.response.GitHubIssueResponse;
import com.remotefalcon.controlpanel.service.ControlPanelService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class ControlPanelController {
  private final ControlPanelService controlPanelService;

  @GetMapping(value = "/controlPanel/gitHubIssues")
  @RequiresAccess
  public ResponseEntity<List<GitHubIssueResponse>> gitHubIssues() {
    return this.controlPanelService.gitHubIssues();
  }

  @PostMapping(value = "/controlPanel/image")
  @RequiresAccess
  public ResponseEntity<String> uploadImage(@RequestParam("file") MultipartFile file) {
    return this.controlPanelService.uploadImage(file);
  }

  @GetMapping(value = "/controlPanel/image/{image}")
  @RequiresAccess
  public ResponseEntity<Boolean> downloadImage(@PathVariable("image") String image) {
    return this.controlPanelService.downloadImage(image);
  }

  @DeleteMapping(value = "/controlPanel/image/{image}")
  @RequiresAccess
  public ResponseEntity<String> deleteImage(@PathVariable("image") String image) {
    return this.controlPanelService.deleteImage(image);
  }

  @GetMapping(value = "/controlPanel/images")
  @RequiresAccess
  public ResponseEntity<List<S3Image>> getImages() {
    return this.controlPanelService.getImages();
  }
}

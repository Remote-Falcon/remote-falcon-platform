package com.remotefalcon.controlpanel.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class WebClientConfiguration {

  @Value("${github.pat:}")
  String gitHubPat;

  @Bean
  public RestTemplate gitHubRestTemplate(RestTemplateBuilder restTemplateBuilder) {
    return restTemplateBuilder
            .rootUri("https://api.github.com")
            .defaultHeader("Authorization", "Bearer " + gitHubPat)
            .defaultHeader("Content-Type", "application/vnd.github+json")
            .setConnectTimeout(Duration.ofSeconds(5))
            .setReadTimeout(Duration.ofSeconds(30))
            .build();
  }
}

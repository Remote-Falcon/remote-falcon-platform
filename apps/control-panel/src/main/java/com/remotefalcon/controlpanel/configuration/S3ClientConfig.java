package com.remotefalcon.controlpanel.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

import java.net.URI;

@Configuration
public class S3ClientConfig {
    @Value("${s3.endpoint:}")
    private String s3Endpoint;
    @Value("${s3.accessKey:}")
    private String s3AccessKey;
    @Value("${s3.secretKey:}")
    private String s3SecretKey;

    // Image hosting (S3 / DigitalOcean Spaces) is optional. Build the client only
    // when s3.endpoint is set; otherwise return null so a self-hosted instance
    // without S3 starts cleanly instead of needing dummy credentials to boot.
    //
    // The empty-endpoint check MUST be done here at runtime, NOT via a
    // @Conditional annotation: control-panel ships as a GraalVM native image,
    // where @Conditional is evaluated at BUILD time. The S3 env vars are not
    // present during the native build (they come from a k8s secret at runtime,
    // not a build-arg), so a build-time condition resolves to false and strips
    // this bean from the binary in every deployment — silently disabling image
    // hosting platform-wide. The @Bean factory method, by contrast, runs at
    // runtime with the real environment. S3Util tolerates a null client (it
    // resolves it via ObjectProvider.getIfAvailable() and null-checks each use).
    @Bean
    public S3Client amazonS3Client() {
        if (s3Endpoint == null || s3Endpoint.isBlank()) {
            return null;
        }
        String normalizedEndpoint = s3Endpoint.contains("://") ? s3Endpoint : "https://" + s3Endpoint;
        AwsBasicCredentials credentials = AwsBasicCredentials.create(s3AccessKey, s3SecretKey);

        return S3Client.builder()
                .credentialsProvider(StaticCredentialsProvider.create(credentials))
                .endpointOverride(URI.create(normalizedEndpoint))
                .region(Region.US_EAST_1)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .httpClient(UrlConnectionHttpClient.builder().build())
                .build();
    }
}

package com.remotefalcon.controlpanel.util;

import com.remotefalcon.controlpanel.model.S3Image;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link S3Util}. All AWS calls are mocked — we never hit
 * real S3. Tests pin the key derivation rule (`<showSubdomain>/<filename>`),
 * the 50-image upload cap, and the URL composition for {@link #getImages}.
 */
@ExtendWith(MockitoExtension.class)
class S3UtilTest {

    private static final String BUCKET = "rf-images-test";
    private static final String CDN = "https://cdn.test.local";
    private static final String SUBDOMAIN = "shortslights";

    @Mock private S3Client s3Client;

    private S3Util s3Util;

    @BeforeEach
    void setUp() {
        s3Util = s3UtilWith(s3Client);
    }

    /**
     * Builds an S3Util whose S3Client is resolved via ObjectProvider — pass
     * {@code null} to simulate an instance where image hosting isn't configured
     * (the S3Client bean is absent because s3.endpoint is blank).
     */
    @SuppressWarnings("unchecked")
    private S3Util s3UtilWith(S3Client client) {
        ObjectProvider<S3Client> provider = mock(ObjectProvider.class);
        lenient().when(provider.getIfAvailable()).thenReturn(client);
        S3Util util = new S3Util(provider);
        ReflectionTestUtils.setField(util, "bucketName", BUCKET);
        ReflectionTestUtils.setField(util, "cdnEndpoint", CDN);
        return util;
    }

    private static MockMultipartFile pngFile(String name, int sizeBytes) {
        byte[] payload = new byte[sizeBytes];
        return new MockMultipartFile("file", name, "image/png", payload);
    }

    private static ListObjectsV2Response listOf(int count) {
        List<S3Object> contents = IntStream.range(0, count)
                .mapToObj(i -> S3Object.builder().key(SUBDOMAIN + "/img-" + i + ".png").build())
                .collect(Collectors.toList());
        return ListObjectsV2Response.builder().contents(contents).build();
    }

    // ---- uploadFile ----

    @Test
    void uploadFile_putsObjectWithComposedKey_lowercased() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listOf(3));

        MultipartFile file = pngFile("Hero.PNG", 100);
        ResponseEntity<String> r = s3Util.uploadFile(file, SUBDOMAIN);

        assertThat(r.getStatusCodeValue()).isEqualTo(200);
        assertThat(r.getBody()).isEqualTo("Hero.PNG");

        ArgumentCaptor<PutObjectRequest> put = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(put.capture(), any(RequestBody.class));
        assertThat(put.getValue().bucket()).isEqualTo(BUCKET);
        // Filename is lowercased; subdomain is the prefix.
        assertThat(put.getValue().key()).isEqualTo("shortslights/hero.png");
        assertThat(put.getValue().contentType()).isEqualTo("image/png");
    }

    @Test
    void uploadFile_returns400_whenAtFiftyImageCap() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listOf(50));

        ResponseEntity<String> r = s3Util.uploadFile(pngFile("extra.png", 10), SUBDOMAIN);

        assertThat(r.getStatusCodeValue()).isEqualTo(400);
        assertThat(r.getBody()).isEqualTo("You have reached the maximum number of images");
        // Important: no putObject when we're at the cap.
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    void uploadFile_returns400_whenAboveFiftyImageCap() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listOf(75));

        ResponseEntity<String> r = s3Util.uploadFile(pngFile("extra.png", 10), SUBDOMAIN);

        assertThat(r.getStatusCodeValue()).isEqualTo(400);
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    // ---- downloadFile ----

    @Test
    void downloadFile_callsGetObjectWithComposedKey_andReturnsTrueOnSuccess() {
        when(s3Client.getObject(any(GetObjectRequest.class), any(ResponseTransformer.class)))
                .thenReturn(null); // sync getObject returns the transformer's result; we don't care here

        Boolean ok = s3Util.downloadFile("hero.png", SUBDOMAIN);

        assertThat(ok).isTrue();
        ArgumentCaptor<GetObjectRequest> req = ArgumentCaptor.forClass(GetObjectRequest.class);
        verify(s3Client).getObject(req.capture(), any(ResponseTransformer.class));
        assertThat(req.getValue().bucket()).isEqualTo(BUCKET);
        assertThat(req.getValue().key()).isEqualTo("shortslights/hero.png");
    }

    // ---- deleteFile ----

    @Test
    void deleteFile_issuesDeleteWithComposedKey() {
        s3Util.deleteFile("hero.png", SUBDOMAIN);

        ArgumentCaptor<DeleteObjectRequest> del = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).deleteObject(del.capture());
        assertThat(del.getValue().bucket()).isEqualTo(BUCKET);
        assertThat(del.getValue().key()).isEqualTo("shortslights/hero.png");
    }

    // ---- getImages ----

    @Test
    void getImages_returnsListWithCdnUrls_andStripsPrefixForName() {
        ListObjectsV2Response listed = ListObjectsV2Response.builder()
                .contents(List.of(
                        S3Object.builder().key(SUBDOMAIN + "/one.png").build(),
                        S3Object.builder().key(SUBDOMAIN + "/two.jpg").build()))
                .build();
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listed);

        List<S3Image> images = s3Util.getImages(SUBDOMAIN);

        assertThat(images).hasSize(2);
        assertThat(images.get(0).getPath()).isEqualTo(CDN + "/" + SUBDOMAIN + "/one.png");
        assertThat(images.get(0).getName()).isEqualTo("one.png");
        assertThat(images.get(1).getPath()).isEqualTo(CDN + "/" + SUBDOMAIN + "/two.jpg");
        assertThat(images.get(1).getName()).isEqualTo("two.jpg");
    }

    @Test
    void getImages_keysWithoutSlash_treatedAsTheirOwnName() {
        // Defensive — if a key was uploaded with no folder prefix the
        // name field falls back to the whole key (no substring NPE).
        ListObjectsV2Response listed = ListObjectsV2Response.builder()
                .contents(List.of(S3Object.builder().key("orphan.png").build()))
                .build();
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listed);

        List<S3Image> images = s3Util.getImages(SUBDOMAIN);

        assertThat(images).hasSize(1);
        assertThat(images.get(0).getName()).isEqualTo("orphan.png");
        assertThat(images.get(0).getPath()).isEqualTo(CDN + "/orphan.png");
    }

    @Test
    void getImages_emptyBucketReturnsEmptyList() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class))).thenReturn(listOf(0));

        List<S3Image> images = s3Util.getImages(SUBDOMAIN);

        assertThat(images).isEmpty();
    }

    // ---- image hosting not configured (no S3Client bean) ----

    @Test
    void uploadFile_returns400_whenS3NotConfigured() {
        S3Util unconfigured = s3UtilWith(null);
        ResponseEntity<String> r = unconfigured.uploadFile(pngFile("hero.png", 10), SUBDOMAIN);
        assertThat(r.getStatusCodeValue()).isEqualTo(400);
        assertThat(r.getBody()).isEqualTo("Image hosting is not configured for this instance.");
    }

    @Test
    void getImages_returnsEmpty_whenS3NotConfigured() {
        assertThat(s3UtilWith(null).getImages(SUBDOMAIN)).isEmpty();
    }

    @Test
    void downloadFile_returnsFalse_whenS3NotConfigured() {
        assertThat(s3UtilWith(null).downloadFile("hero.png", SUBDOMAIN)).isFalse();
    }

    @Test
    void deleteFile_noOps_whenS3NotConfigured() {
        s3UtilWith(null).deleteFile("hero.png", SUBDOMAIN); // must not throw
    }
}

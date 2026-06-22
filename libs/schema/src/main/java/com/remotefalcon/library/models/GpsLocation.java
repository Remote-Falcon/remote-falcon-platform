package com.remotefalcon.library.models;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.eclipse.microprofile.graphql.Type;

/**
 * An additional allowed GPS location for the geofence (#16). A viewer is "present"
 * if within the show's {@code allowedRadius} of the primary location
 * ({@code showLatitude}/{@code showLongitude}) OR any of these.
 */
@Type
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GpsLocation {
    private Float latitude;
    private Float longitude;
}

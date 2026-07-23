package com.remotefalcon.controlpanel.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ShowsOnAMap {
    private String showName;
    private String showSubdomain;
    private Float showLatitude;
    private Float showLongitude;
    // True when the show opted into the public map. Lets the dashboard map
    // badge public vs members-only pins. Always true on the public query
    // (it only returns public opt-ins).
    private Boolean publiclyVisible;
}

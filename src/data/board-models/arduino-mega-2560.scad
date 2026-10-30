$fn = 32;
pcb_w = 101.6; pcb_h = 53.3; pcb_t = 1.6;
hole_d = 3.2;

// PCB
color("green") difference() {
    cube([pcb_w, pcb_h, pcb_t]);
    for (p = [[14.0, 2.54], [15.24, 50.8], [90.17, 7.62], [90.17, 35.56]])
        translate([p[0], p[1], -0.1]) cylinder(d=hole_d, h=pcb_t+0.2);
}

// Uno-compatible headers (same side as Uno)
color([0.2,0.2,0.2]) {
    // Analog side
    translate([3.0, 1.0, pcb_t]) cube([6*2.54, 2.54, 8.5]);
    translate([3.0+6*2.54+2.0, 1.0, pcb_t]) cube([8*2.54, 2.54, 8.5]);
    // Digital side
    translate([22.0, pcb_h-3.54, pcb_t]) cube([8*2.54, 2.54, 8.5]);
    translate([22.0+8*2.54+2.0, pcb_h-3.54, pcb_t]) cube([8*2.54, 2.54, 8.5]);
}

// Extended digital pins 22-53: 2x 18-pin double row
color([0.2,0.2,0.2]) {
    translate([55.0, 1.0, pcb_t]) cube([18*2.54, 2*2.54, 8.5]);
}

// Analog A8-A15 header
color([0.2,0.2,0.2]) translate([55.0, pcb_h-6.0, pcb_t]) cube([8*2.54, 2.54, 8.5]);

// USB-B connector
color("silver") translate([-4.0, (pcb_h-16)/2, pcb_t]) cube([12, 16, 11]);

// ATmega2560 QFP
color([0.1,0.1,0.1]) translate([38.0, 18.0, pcb_t]) cube([14, 14, 1.5]);

// Power barrel jack
color([0.2,0.2,0.2]) translate([-2.0, 3.0, pcb_t]) cube([9, 14, 11]);

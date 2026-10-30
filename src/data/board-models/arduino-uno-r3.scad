$fn = 32;
pcb_w = 68.6; pcb_h = 53.4; pcb_t = 1.6;
hole_d = 3.2;

// PCB
color("green") difference() {
    cube([pcb_w, pcb_h, pcb_t]);
    for (p = [[14.0, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]])
        translate([p[0], p[1], -0.1]) cylinder(d=hole_d, h=pcb_t+0.2);
}

// Analog headers (left side): 6-pin + 8-pin
color([0.2,0.2,0.2]) {
    translate([3.0, 1.0, pcb_t]) cube([6*2.54, 2.54, 8.5]);
    translate([3.0+6*2.54+2.0, 1.0, pcb_t]) cube([8*2.54, 2.54, 8.5]);
}

// Digital headers (right side): 8-pin + 8-pin
color([0.2,0.2,0.2]) {
    translate([22.0, pcb_h-3.54, pcb_t]) cube([8*2.54, 2.54, 8.5]);
    translate([22.0+8*2.54+2.0, pcb_h-3.54, pcb_t]) cube([8*2.54, 2.54, 8.5]);
}

// ICSP 2x3 header
color([0.2,0.2,0.2]) translate([50.0, 25.0, pcb_t]) cube([3*2.54, 2*2.54, 8.5]);

// USB-B connector
color("silver") translate([-4.0, (pcb_h-16)/2, pcb_t]) cube([12, 16, 11]);

// ATmega328P
color([0.1,0.1,0.1]) translate([30.0, 20.0, pcb_t]) cube([8, 8, 1.5]);

// Power barrel jack
color([0.2,0.2,0.2]) translate([-2.0, 3.0, pcb_t]) cube([9, 14, 11]);

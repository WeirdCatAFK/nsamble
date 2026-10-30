$fn = 32;
pcb_w = 45.0; pcb_h = 18.0; pcb_t = 1.6;

// PCB
color("green") cube([pcb_w, pcb_h, pcb_t]);

// Pin headers: 2x 15-pin along long edges
color([0.2,0.2,0.2]) {
    translate([1.27, 0, pcb_t]) cube([15*2.54, 2.54, 8.5]);
    translate([1.27, pcb_h-2.54, pcb_t]) cube([15*2.54, 2.54, 8.5]);
}

// Mini-USB connector
color("silver") translate([-2.0, (pcb_h-7)/2, pcb_t]) cube([8, 7, 4]);

// ATmega328P
color([0.1,0.1,0.1]) translate([16.0, 5.5, pcb_t]) cube([7, 7, 1.5]);

// ICSP 2x3 header
color([0.2,0.2,0.2]) translate([34.0, 7.0, pcb_t]) cube([3*2.54, 2*2.54, 3.0]);

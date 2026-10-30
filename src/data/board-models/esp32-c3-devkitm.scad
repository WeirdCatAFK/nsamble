$fn = 32;
pcb_w = 53.0; pcb_h = 18.5; pcb_t = 1.0;

// PCB
color("green") cube([pcb_w, pcb_h, pcb_t]);

// Pin headers: 2x 13-pin along long edges
color([0.2,0.2,0.2]) {
    translate([1.27, 0, pcb_t]) cube([13*2.54, 2.54, 8.5]);
    translate([1.27, pcb_h-2.54, pcb_t]) cube([13*2.54, 2.54, 8.5]);
}

// USB-C connector
color("silver") translate([-1.5, (pcb_h-9)/2, pcb_t]) cube([7, 9, 3.5]);

// ESP32-C3-MINI module
color("silver") translate([pcb_w-16.6-2.0, (pcb_h-13)/2, pcb_t]) cube([16.6, 13, 2.8]);

// Antenna area
color([0.9,0.85,0.7]) translate([pcb_w-5.0, (pcb_h-10)/2, pcb_t+2.8]) cube([3.5, 10, 0.3]);

// Reset button
color([0.3,0.3,0.3]) translate([6.0, pcb_h/2, pcb_t]) cylinder(d=3.5, h=2.0);

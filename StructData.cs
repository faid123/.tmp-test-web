using g4;
using System;
using System.IO;
using System.Runtime.InteropServices;
using UnityEngine;

//custom enums
public enum RPDDirection { Distal = 1, Mesial }; //distal = 1 to match VisualsDirectionTag numbering
												 //custom enums

public enum Jaw_Type { upper_jaw, lower_jaw };
public enum Jaw_Material { metal_jaw, acrylic_jaw, full_acrylic_jaw };  // phase3-full acrylic (or swift flex denture)
public enum Tooth_Type { posterior, anterior };
public enum Tooth_Presence { present, missing };
public enum Tooth_Condition { normal, abutment, compromise };
[System.Serializable] public enum Tooth_Placement_Type { FIXED_TPT, ARTIFICAL_TPT, EXCLUDE_TPT, NULL };
public enum Compute_Denture_Status { SUCCESS = 0, ERROR_NEED_FULL_DENTURE = 5001, ERROR_NO_NEED_DENTURE = 5002, ERROR_DATA_INVALID = 5003, ERROR_FILE_ACCESS = 5004 };
public enum Reciprocating_Type { no_reciprocating, reciprocating_clasp, reciprocating_plate, reciprocating_crossmesh };


public enum Retainer_Type { no_retainer, clasp_retainer, ring_retainer, bar_retainer };
public enum Retainer_Clasp_type { rc_mesiobuccal, rc_mesiolingual, rc_distobuccal, rc_distolingual };
public enum Retainer_Ring_type { rr_mesiobuccal, rr_mesiolingual, rr_distobuccal, rr_distolingual };
public enum Retainer_Bar_Type { rb_mesial, rb_distal };
public enum Retainer_Bar_Category { rb_I, rb_S, rb_U, rb_Y, rb_T, rb_R };

public enum Anterior_Rest { no_ar, ar_cingulum, ar_incisal };
public enum Anterior_Cingulum_Rest_Type { ac_full, ac_mesial, ac_distal, ac_both };
public enum Anterior_Incisal_Rest_Type { ai_mesial, ai_distal };

public enum Posterior_Rest_Type { no_pr, pr_full, pr_non_full };
public enum Posterior_Rest_Position { p_mesial = 0, p_distal = 1, p_lingual = 2 };
public enum Mesh_Type { no_mesh, hole_mesh, tori_mesh, strip_mesh, cross_mesh, plate_mesh };
public enum Major_Connector_Type { mc_none, mc_palatal_strap, mc_horseshoe, mc_hole, mc_palatal_bar, mc_palatal_full_plate, mc_lingual_bar, mc_lingual_plate, mc_lingual_kennedy, mc_cingulum_bar };

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Index
{
	public int major_index;
	public int minor_index;
	public int tooth_type;
	public int tooth_presence;
	public int tooth_condition;
	public int mesh_presence;
	public int array_index;

	// added controls for tissue stops and retention pins
	public int tissue_stop_presence;
	public int retention_pin_presence;
	public dVector tooth_position;

	public void Init()
	{
		if (Solo2DManager.IsSolo2D)
		{
			tooth_presence = (int)Tooth_Presence.present;
			return;
		}

		tooth_presence = (int)Tooth_Presence.missing;
		tooth_condition = (int)Tooth_Condition.normal;
		tissue_stop_presence = (int)Tooth_Presence.missing;
		retention_pin_presence = (int)Tooth_Presence.missing;
	}

	public int get_array_index()
	{
		int ai;

		// set array_index for 1 and 2
		if ((major_index == 1) || (major_index == 3))
			ai = 8 - minor_index;
		else // 2 or 4 
			ai = 7 + minor_index;

		return ai;
	}

	public void set_array_index()
	{
		array_index = get_array_index();
	}

	public Tooth_Index Clone()
	{
		return new Tooth_Index
		{
			major_index = this.major_index,
			minor_index = this.minor_index,
			tooth_type = this.tooth_type,
			tooth_presence = this.tooth_presence,
			tooth_condition = this.tooth_condition,
			mesh_presence = this.mesh_presence,
			array_index = this.array_index,
			tissue_stop_presence = this.tissue_stop_presence,
			retention_pin_presence = this.retention_pin_presence,
			tooth_position = this.tooth_position.Clone()
		};
	}
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Main
{
	public Tooth_Index ti;
	public Tooth_Rest tr;
	public Tooth_Retainer trt;
	public Tooth_Reciprocating trc;

	public IntPtr sm;

	public void Init()
	{
		ti = new Tooth_Index();
		ti.Init();
		tr = new Tooth_Rest();
		tr.Init();
		trt = new Tooth_Retainer();
		trc = new Tooth_Reciprocating();
	}

	public void SaveData()
	{
		//tr.SaveData();
	}

	public Tooth_Main Clone()
	{
		return new Tooth_Main
		{
			ti = this.ti.Clone(),
			tr = this.tr.Clone(),
			trt = this.trt.Clone(),
			trc = this.trc.Clone(),
			sm = this.sm // ⚠ Shallow copy unless you implement manual memory duplication
		};
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Retainer
{
	public int retainer_type;
	public int retainer_clasp_type;
	public int retainer_ring_type;
	public int retainer_bar_type;
	public int retainer_bar_category;

	public PolyLines pl;

	public int special_indicator;

	public Tooth_Retainer Clone()
	{
		return new Tooth_Retainer
		{
			retainer_type = this.retainer_type,
			retainer_clasp_type = this.retainer_clasp_type,
			retainer_ring_type = this.retainer_ring_type,
			retainer_bar_type = this.retainer_bar_type,
			retainer_bar_category = this.retainer_bar_category,
			pl = this.pl.Clone(),
			special_indicator = this.special_indicator
		};
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Reciprocating
{
	public int reciprocating_type;
	public int reciprocating_patterntype;

	public PolyLines pl; // this is the skeletonal line structure, limit = 1 implies this should be a single polyline  

	public Tooth_Reciprocating Clone()
	{
		return new Tooth_Reciprocating
		{
			reciprocating_type = this.reciprocating_type,
			reciprocating_patterntype = this.reciprocating_patterntype,
			pl = this.pl.Clone()
		};
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Rest
{
	public int tooth_type;
	public int anterior_rest;
	public int anterior_cingulum_rest_type;
	public int anterior_incisal_rest_type;
	public int posterior_rest_type;
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
	public int[] pr_config;

	public PolyLines pl;

	public void Init()
	{
		tooth_type = anterior_rest = anterior_cingulum_rest_type
		= anterior_incisal_rest_type = posterior_rest_type = 0;
		pr_config = new int[3];
		pr_config[0] = pr_config[1] = pr_config[2] = 1;
	}

	public Tooth_Rest Clone()
	{
		return new Tooth_Rest
		{
			tooth_type = this.tooth_type,
			anterior_rest = this.anterior_rest,
			anterior_cingulum_rest_type = this.anterior_cingulum_rest_type,
			anterior_incisal_rest_type = this.anterior_incisal_rest_type,
			posterior_rest_type = this.posterior_rest_type,
			pr_config = (int[])this.pr_config.Clone(),
			pl = this.pl.Clone()
		};
	}
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Jaw
{
	public int jaw_type;
	public int jaw_material;
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 16, ArraySubType = UnmanagedType.Struct)]
	public Tooth_Main[] tooth;
	public int number_meshes;
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 8, ArraySubType = UnmanagedType.Struct)]
	public Tooth_Mesh[] tm;
	public Major_Connector major_c;

	public int palatal_patterntype;
	public int archridge_patterntype;
	public Surface_Mesh sm_palatal;
	public Surface_Mesh sm_archridge;

	public float retainer_diameter1;   // Diameter 1 of bars and retainers, tapers polylines (mm)
	public float retainer_diameter2;   // Diameter 2 of bars and retainers, tapers polylines (mm)
	public float retainer_arm_diameter2;   // Diameter of the end of retainer arms after they fork (mm)
	public float lingual_bar_width;    // Starting width of lingual bar (mm)
	public float lingual_bar_thickness;    // Thickness of the lingual bar (mm)
	public float lingual_plate_thickness;   // Thickness of the rests, and also lingual plate (mm)

	/*  Array assignment Naming convention 	
		tooth[0]  is  tooth 18 
		tooth[1]  is  tooth 17 
		.....
		tooth[7]  is  tooth 11
		tooth[8]  is  tooth 21
		.....		
		tooth[15]  is  tooth 28 
	*/

	public void Init(Jaw_Type type)
	{
		jaw_type = (int)type;
		jaw_material = 0;
		tooth = new Tooth_Main[16];
		tm = new Tooth_Mesh[8];
		//.Init();
		major_c = new Major_Connector();
		major_c.Init();

		retainer_diameter1 = Constants.Values.default_retainer_diameter1;
		retainer_diameter2 = Constants.Values.default_retainer_diameter2;
		retainer_arm_diameter2 = Constants.Values.default_retainer_arm_diameter2;
		lingual_bar_width = Constants.Values.default_lingual_bar_width;
		lingual_bar_thickness = Constants.Values.default_lingual_bar_thickness;
		lingual_plate_thickness = Constants.Values.default_lingual_plate_thickness;

		if (jaw_type == (int)Jaw_Type.upper_jaw)
		{
			initializeTooth(1); // creates 18 to 11 tooth 
			initializeTooth(2); // create 21 to 28 tooth

		}
		else
		{
			initializeTooth(3); // create 38 to 31 tooth 
			initializeTooth(4); // create 41 to 48 tooth
		}
	}

	void initializeTooth(int major)
	{
		// range from 1 to 8 
		for (int b = 1; b < 9; b++)
		{
			// creating the individual tooth and creating the array index value. 
			Tooth_Main temp_tooth = new Tooth_Main();
			temp_tooth.Init();
			temp_tooth.ti = new Tooth_Index();
			temp_tooth.ti.Init();
			temp_tooth.ti.major_index = major;
			temp_tooth.ti.tooth_condition = (int)Tooth_Condition.normal;

			// reverse the indexing 
			if ((major == 1) || (major == 3))
				temp_tooth.ti.minor_index = 9 - b;
			else
				temp_tooth.ti.minor_index = b;

			// setting the tooth type 
			if (temp_tooth.ti.minor_index < 4)
				temp_tooth.ti.tooth_type = (int)Tooth_Type.anterior;
			else
				temp_tooth.ti.tooth_type = (int)Tooth_Type.posterior;

			// setting the array index based on major and minor 
			temp_tooth.ti.set_array_index();

			//			tooth.push_back(temp_tooth);  // pushing it to the vector tooth 
			tooth[temp_tooth.ti.array_index] = temp_tooth; // replace the vector push_back function
		}

	}

	public int FindToothIndexByArrayIndex(int index)
	{
		foreach (var toothObj in tooth)
		{
			if (toothObj.ti.array_index == index)
				return toothObj.ti.major_index * 10 + toothObj.ti.minor_index;
		}

		return 0;
	}

	public ref Tooth_Main FindToothIndex(int index)
	{
		int i = 0;
		foreach (var toothObj in tooth)
		{
			if (toothObj.ti.major_index * 10 + toothObj.ti.minor_index == index)
			{
				return ref tooth[i];
			}
			i++;
		}

		return ref tooth[0];
	}

	public Jaw Clone()
	{
		Jaw clone = new Jaw();

		clone.jaw_type = this.jaw_type;
		clone.jaw_material = this.jaw_material;

		// Deep clone of the tooth array
		clone.tooth = new Tooth_Main[this.tooth.Length];
		for (int i = 0; i < this.tooth.Length; i++)
		{
			clone.tooth[i] = this.tooth[i].Clone();
		}

		// Deep clone of the mesh array
		clone.tm = new Tooth_Mesh[this.tm.Length];
		for (int i = 0; i < this.tm.Length; i++)
		{
			clone.tm[i] = this.tm[i].Clone();
		}

		// Deep clone of major connector
		clone.major_c = this.major_c.Clone();

		// Copy pattern types and surface meshes
		clone.palatal_patterntype = this.palatal_patterntype;
		clone.archridge_patterntype = this.archridge_patterntype;
		clone.sm_palatal = this.sm_palatal;
		clone.sm_archridge = this.sm_archridge;

		// Primitive fields
		clone.retainer_diameter1 = this.retainer_diameter1;
		clone.retainer_diameter2 = this.retainer_diameter2;
		clone.retainer_arm_diameter2 = this.retainer_arm_diameter2;
		clone.lingual_bar_width = this.lingual_bar_width;
		clone.lingual_bar_thickness = this.lingual_bar_thickness;
		clone.lingual_plate_thickness = this.lingual_plate_thickness;
		clone.number_meshes = this.number_meshes;

		return clone;
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Path_Connector
{
	public int activated;  // minor connector values: 0=present, 1=missing (using enum)
	public PolyLines pl;

	public void Init()
	{
		activated = 1;
		pl = new PolyLines();
		pl.Init();
	}

	public Path_Connector Clone()
	{
		return new Path_Connector
		{
			activated = this.activated,
			pl = this.pl.Clone()
		};
	}
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Minor_Connector
{
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 16, ArraySubType = UnmanagedType.Struct)]
	public Path_Connector[] Path;

	public void Init()
	{
		Path = new Path_Connector[16];

		foreach (var pathObj in Path)
		{
			pathObj.Init();
		}
	}

	// For minor connector path array [16],
	// Apply to posterior and anterior teeth, for path that has no distal or mesial face, the path's first index (eg [0], [2], ...) will indicate connection state 
	// [0].activated - Path A Distal
	// [1].activated - Path A Mesial
	// [2].activated - Path B Distal
	// [3].activated - Path B Mesial
	// [4].activated - Path C Distal
	// [5].activated - Path C Mesial
	// [6].activated - Path D Distal
	// [7].activated - Path D Mesial
	// [8].activated - Path E Distal
	// [9].activated - Path E Mesial
	// [10].activated - Path F Distal
	// [11].activated - Path F Mesial
	// [12].activated - Path G Distal
	// [13].activated - Path G Mesial
	// [14].activated - Path H Distal
	// [15].activated - Path H Mesial

	public Minor_Connector Clone()
	{
		Minor_Connector clone = new Minor_Connector
		{
			Path = new Path_Connector[this.Path.Length]
		};

		for (int i = 0; i < this.Path.Length; i++)
		{
			clone.Path[i] = this.Path[i].Clone();
		}

		return clone;
	}
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Major_Connector
{
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 16, ArraySubType = UnmanagedType.Struct)]
	public Minor_Connector[] minor_c;
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)]
	public int[] ball_connector; // will only be used if jaw material = acrylic_jaw  

	public int major_connector_type;

	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
	public int[] start_Index; // indicates where the major connector starts and ends. The range is from 0 to 15, max 2 major connectors in one jaw
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
	public int[] end_Index;   // first or default major connector at [0], 2nd major connector at [1]. Write at 2D stage by UI app, read by 3D polyline

	public PolyLines pl;

	public void Init()
	{
		minor_c = new Minor_Connector[16];

		for (int i = 0; i < minor_c.Length; i++)
		{
			minor_c[i].Init();
		}

		ball_connector = new int[17];
		major_connector_type = 0;
		start_Index = new int[2];
		end_Index = new int[2];
		start_Index[0] = 0; //left start if not horseshoe shaped
		end_Index[0] = 15; //left end if not horseshoe shaped
		start_Index[1] = 0; //right start if not horseshoe shaped
		end_Index[1] = 15; //right end if not horseshoe shaped
	}

	public Major_Connector Clone()
	{
		Major_Connector clone = new Major_Connector
		{
			ball_connector = (int[])this.ball_connector.Clone(),
			major_connector_type = this.major_connector_type,
			start_Index = (int[])this.start_Index.Clone(),
			end_Index = (int[])this.end_Index.Clone(),
			pl = this.pl.Clone(),
			minor_c = new Minor_Connector[this.minor_c.Length]
		};

		for (int i = 0; i < this.minor_c.Length; i++)
		{
			clone.minor_c[i] = this.minor_c[i].Clone();
		}

		return clone;
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Mesh
{
	public int mt;                     // this is used to indicate the mesh type  
	public int start_Index, end_Index;  // indicates where this mesh starts and ends at. The range is from 0 to 15 

	public PolyLines pl;

	public PolyLines start_proximal, end_proximal;
	public PolyLines reversal_line;


	public int number_of_holes;
	public float hole_diameter;
	public IntPtr hole_centroids;

	public Tooth_Mesh Clone()
	{
		return new Tooth_Mesh
		{
			mt = this.mt,
			start_Index = this.start_Index,
			end_Index = this.end_Index,
			pl = this.pl.Clone(),
			start_proximal = this.start_proximal.Clone(),
			end_proximal = this.end_proximal.Clone(),
			reversal_line = this.reversal_line.Clone(),
			number_of_holes = this.number_of_holes,
			hole_diameter = this.hole_diameter,
			hole_centroids = this.hole_centroids // ⚠️ Consider deep copy if needed
		};
	}
};


[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Surface_Mesh
{
	public int point_size;
	public IntPtr points;       // dVector*
	public int face_size;
	public IntPtr face_index;   // int **
	public IntPtr patch_id;     // int *			// provides details of which patch this face belongs to 
	public IntPtr k1;           // float * 			// domination curvature value 
	public IntPtr k2;           // float * 			// 2nd curvature value 
	public IntPtr k1_vec;       // dVector *		// domination curvature direction 
	public IntPtr k2_vec;       // dVector *		// 2nd curvature direction
	public IntPtr occlusion;    // float *			//  occulsion values 
	public IntPtr surveying;    // float *			//	surveying values 
	public IntPtr trimming;     // float *			//  holding trimming values.
	public IntPtr cname;        //
}


[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct dVector
{
	public dVector(double x, double y, double z)
	{
		vec = new double[3];
		vec[0] = x;
		vec[1] = y;
		vec[2] = z;
	}

	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 3)]
	public double[] vec;

	public dVector Clone()
	{
		if (vec != null)
			return new dVector(this.vec[0], this.vec[1], this.vec[2]);
		else
		{
			Debug.LogWarning("dVector Clone() called on null object, returning new dVector instance.");
			return new dVector();
		}
	}

	public override string ToString()
	{
		return $"{vec[0]} {vec[1]} {vec[2]}";
	}

	public void WriteTo(TextWriter writer)
	{
		writer.WriteLine(ToString());
	}

	public void appendToFile(string fileName)
	{
		using (StreamWriter writer = new StreamWriter(fileName, true)) // true = append
		{
			WriteTo(writer);
		}
	}

	public double LengthSquared()
	{
		return vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2];
	}
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct dVectorr
{
	public double x;
	public double y;
	public double z;

	public dVectorr(double x, double y, double z)
	{
		this.x = x;
		this.y = y;
		this.z = z;
	}
	public bool IsZero()
	{
		return x == 0 && y == 0 && z == 0;
	}

	// Implicit conversion to Vector3d
	public static implicit operator Vector3d(dVectorr v)
	{
		return new Vector3d(v.x, v.y, v.z);
	}

	// Explicit conversion from Vector3d to dVectorr
	public static explicit operator dVectorr(Vector3d v)
	{
		return new dVectorr(v.x, v.y, v.z);
	}
}


[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Data
{
	public bool arch_path; // this bool identify itself if this is a arch path 

	// if arch_path == true 
	public int arch_path_start_tooth_index, arch_path_end_tooth_index; // this tells which missing tooth does this path represents 
	public int arch_path_line_size;
	public IntPtr arch_path_line; // this is a list of vector points that exist on the mesh, identifying itself to be a arch_path 


	// if arch_path == false 
	public int patch_id;   // this is an unique identifier, it is not contiguous, can be random 
	public int minor_index, major_index;  // tells you which tooth this patch belongs to 


	// this is a variable 2D length, each of the array host a variable array length 
	public int vertices_border_chain_size;
	public IntPtr vertices_border_chain_array_size;
	public IntPtr vertices_border_chain; // a set of list of vertices points that forms the boundary, and there might be multiple chains of it. 


	public int face_list_size;
	public IntPtr face_list; // points to the faces that belongs to this Tooth patch  

	// for anterior tooth, there are 4 possible choices for rest position 
	// for posterior tooth, there are 3 possible choice 

	//int no_rest; // dependent on rest position 
	//dVector *rest_position; 

	// these are positional vectors
	public dVector mesial_rest, distal_rest, lingual_rest; // these are used if this is an anterior tooth
	public dVector cingulum_mesial_rest, cingulum_distal_rest, incisal_mesial_rest, incisal_distal_rest; // these are used if this is an posterior tooth 

	// these are directional vectors 
	public dVector buccal, mesial; //these 2 vectors indicates the directional vector associated with this tooth c 


}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Full_Tooth_Data
{
	public int jaw_start_index, jaw_end_index; // this tells us for this jaw scan, how many tooths are possible to be placed here, including missing ones.  
	public IntPtr td; // we can fixed it at 16  
	public int tooth_data_number; // because an arch consist of a few tooths, so tooth data cannot be fixed at 16
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
	public dVector[] tooth_centroid; // for valid missing tooth, it would lie on the path, for present tooth, it would be in the middle of the tooth 
};


[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct PolyLines
{

	public int line_limit; // this is the limit whereby how many polyline can be branched off 

	public int line_count;
	public IntPtr p_lines;

	public void Init()
	{
		line_limit = 1;
		line_count = 0;  // this allow us to know if this polyline has been previously initalized 
	}

	void set_line_limit(int limit)
	{
		line_limit = limit;
	}

	public PolyLines Clone()
	{
		PolyLines clone = new PolyLines
		{
			line_limit = this.line_limit,
			line_count = this.line_count,
			p_lines = this.p_lines
		};

		return clone;
	}
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Single_Polyline
{
	public int origin_line_index;

	public int node_count;

	public IntPtr rootNode;
	public IntPtr linked_Root; // this is the link to the origin line.  


	public void Init()
	{
		origin_line_index = -1; // -1 refers to the main line 
		node_count = 0;
	}

};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
// provides the link list 
public struct Linked_dVec
{
	public int infer_location; // used for internal reference, checking 

	public IntPtr node;
	public IntPtr next;
	public int specialNode;  // to indicate that this node cannot be deleted 
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tuple_3_H
{
	public int x;
	public int y;
	public int z;
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct BoxGrid_H
{

	public float gridInterval; // how large is 1 cube's side 
	public dVector minLoc;
	public Tuple_3_H voxel_size; // this tells us how many voxel in each axis-directions, x-y-z 

	public IntPtr cubeGrid;
}

[StructLayout(LayoutKind.Sequential)]
[Serializable]
// the struct to contain whatever is inside a point 
public struct Parameterized_Mesh_Point_Data
{
	dVector pos; // the location of the point on the mesh 
	int valid; // determine whether this point was a covered point (0) or original mesh (1) 
	float survey; // how much surveying value does it have 
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
// a helper struct to hold things together , this contains a single parameterization face 
public struct Single_Face_Parameterization
{
	int u_count, v_count; // how many points in the u and v space 
	IntPtr ppa;
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
// this contains the paramterization for a single tooth, contains 6 paramterized face 
public struct Tooth_Mesh_Parameterization
{
	int tooth_index; // states which tooth this is, 0 to 15 
	dVector normal, mesial, buccal;
	[MarshalAs(UnmanagedType.ByValArray, SizeConst = 6, ArraySubType = UnmanagedType.Struct)]
	Single_Face_Parameterization[] cuboid_face; // 6 faces to this tooth 
};

[StructLayout(LayoutKind.Sequential)]
[Serializable]
// this contains the parameterization for the entire jaw, 16 tooths + 1 arch ridge + 1 palatal region 
public struct Jaw_Mesh_Parameterization
{
	public float jaw_model_rotation; // stores the anti-clockwise rotation for this model, rotates clockwise to go back 
	int tooth_count; // states how many tooths are there 
	IntPtr tooth_parameterization;
	Single_Face_Parameterization arch_parameterization, palatal_parameterization;
};

// instruction to transform the tooth 
[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Transformation_Interface
{
	dVector buccal_direction; // where is the buccal direction of this tooth pointing at 
	dVector mesial_distal_line; // where the line across is <--- this can be inferred by the other values, its always pointing to the start of the curve
	dVector buccal_point; // where is the occusal direction of this tooth point at  
	dVector gingival_point; // where is the occusal direction of this tooth point at  
	float mesial_distal_sizing; // how wide to space the tooth in the mesial-distal direction 
};

// these are inherent to the tooth 
[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Tooth_Landmark_Interface
{
    public int tooth_index;
    public Tooth_Placement_Type tpt;
    public dVector buccal_direction;
    public dVector buccal_point;
    public dVector gingival_point;
    public dVector mesial_point;
    public dVector distal_point;

    // keep it simple just add these 2 
    public int mesial_index;
    public int distal_index;

    // @like <--- add this two  
    public int size_gingival_indices;
    public IntPtr gingival_indices;    // int*

    public Tooth_Landmark_Interface Clone()
    {
        Tooth_Landmark_Interface clone = new Tooth_Landmark_Interface
        {
            tooth_index = this.tooth_index,
            tpt = this.tpt,
            buccal_direction = this.buccal_direction,
            buccal_point = this.buccal_point,
            gingival_point = this.gingival_point,
            mesial_point = this.mesial_point,
            distal_point = this.distal_point,
            mesial_index = this.mesial_index,
            distal_index = this.distal_index,
            size_gingival_indices = this.size_gingival_indices,
            gingival_indices = this.gingival_indices
        };

        return clone;
    }

    [DllImport("Module6PolylineCurves", CallingConvention = CallingConvention.Cdecl)]
    private static extern int get_ToothLandmark_SerializedSize(IntPtr toothLandmark, out UIntPtr outSize);

    [DllImport("Module6PolylineCurves", CallingConvention = CallingConvention.Cdecl)]
    private static extern int save_ToothLandmark_ToBuffer(IntPtr toothLandmark, [Out] byte[] buffer, UIntPtr bufferSize, out UIntPtr bytesWritten);

    [DllImport("Module6PolylineCurves", CallingConvention = CallingConvention.Cdecl)]
    private static extern int load_ToothLandmark_FromBuffer(IntPtr toothLandmark, [In] byte[] buffer, UIntPtr bufferSize);

    // Factory: create a managed struct by deserializing into unmanaged memory and marshalling back
    public static Tooth_Landmark_Interface CreateFromBuffer(byte[] buffer)
    {
        if (buffer == null || buffer.Length == 0)
            throw new ArgumentException("Buffer is null or empty.", nameof(buffer));

        int size = Marshal.SizeOf(typeof(Tooth_Landmark_Interface));
        IntPtr nativePtr = Marshal.AllocHGlobal(size);
        try
        {
            // Zero-init the native memory in case the native loader expects a clean slate
            for (int i = 0; i < size; i++) Marshal.WriteByte(nativePtr, i, 0);

            int rc = load_ToothLandmark_FromBuffer(nativePtr, buffer, (UIntPtr)buffer.Length);
            if (rc != 0)
                throw new InvalidOperationException($"Failed to deserialize Tooth_Landmark_Interface. rc={rc}");

            // Marshal back to managed struct for UI/use
            return Marshal.PtrToStructure<Tooth_Landmark_Interface>(nativePtr);
        }
        finally
        {
            Marshal.FreeHGlobal(nativePtr);
        }
    }

    // serialize this managed struct by first copying it to unmanaged memory, then asking native to serialize
    public byte[] Serialize()
    {
        int size = Marshal.SizeOf(typeof(Tooth_Landmark_Interface));
        IntPtr nativePtr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(this, nativePtr, false);

            if (get_ToothLandmark_SerializedSize(nativePtr, out UIntPtr outSize) != 0)
                throw new InvalidOperationException("Failed to get serialized size for Tooth_Landmark_Interface.");

            int intSize = checked((int)outSize);
            var buffer = new byte[intSize];

            if (save_ToothLandmark_ToBuffer(nativePtr, buffer, outSize, out UIntPtr bytesWritten) != 0)
                throw new InvalidOperationException("Failed to serialize Tooth_Landmark_Interface.");

            if (bytesWritten != outSize)
                throw new InvalidOperationException("Serialized size mismatch for Tooth_Landmark_Interface.");

            return buffer;
        }
        finally
        {
            Marshal.DestroyStructure<Tooth_Landmark_Interface>(nativePtr);
            Marshal.FreeHGlobal(nativePtr);
        }
    }

    
};

// unused for now
[StructLayout(LayoutKind.Sequential)]
[Serializable]
public struct Artificial_Tooth_Set
{
	public IntPtr tli;
	public IntPtr sm;
};


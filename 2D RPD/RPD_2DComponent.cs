using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[Serializable]
public class RPD_2DComponent : MonoBehaviour
{
	public static RPD_2DComponent Instance { get; private set; }

	private void Awake()
	{
		Instance = this;
	}
	public enum componentType // cannot change the order can only append to the back as it will change the references on unity scene for 2DRPD components
	{
		no_mc_upper_jaw,
		mc_palatal_strap,
		mc_horseshoe,
		mc_hole,
		mc_palatal_bar,
		no_mc_lower_jaw,
		mc_lingual_bar,
		mc_lingual_plate,
		mc_lingual_kennedy,
		mc_cingulum_bar,
		ai_mesial,
		ai_distal,
		ac_full,
		ac_mesial,
		ac_distal,
		ac_both,
		p_mesial,
		p_distal,
		p_lingual,
		pr_full,
		rc_mesiobuccal,
		rc_mesiolingual,
		rc_distobuccal,
		rc_distolingual,
		rr_mesiobuccal,
		rr_mesiolingual,
		rr_distobuccal,
		rr_distolingual,
		rr_distal,
		rb_I_distal,
		rb_S_distal,
		rb_U_distal,
		rb_Y_distal,
		rb_I_mesial,
		rb_S_mesial,
		rb_U_mesial,
		rb_Y_mesial,
		reciprocating_clasp,
		reciprocating_plate,
		hole_mesh,
		tori_mesh,
		strip_mesh,
		cross_mesh,
		plate_mesh,
		rb_mid,
		rb_end_mesial,
		rb_end_distal,
		rb_bar_end_mesial,
		r_ball,
		rb_T_distal,
		rb_T_mesial,
		rb_R_distal,
		rb_R_mesial,
		flange,
		asmbly_smp_cir_mesial,
		asmbly_smp_cir_distal,
		asmbly_embrasure,
		asmbly_ringsupp,
		asmbly_reverse_mesial,
		asmbly_reverse_distal,
		asmbly_halfhalf_mesial,
		asmbly_halfhalf_distal,
		asmbly_multi_circumferential,
		asmbly_combi_circumferential,
		asmbly_Tbar_mesial,
		asmbly_Tbar_distal,
		asmbly_Tbar_mod_mesial,
		asmbly_Tbar_mod_distal,
		asmbly_Ibar_mod_mesial,
		asmbly_Ibar_mod_distal,
		asmbly_RPI_mesial,
		asmbly_RPI_distal,
		asmbly_CombiBar,
		mc_palatal_full_plate,
		TypeNull,

		//recip clasps
		recip_clasp_mesiobuccal = 1000,
		recip_clasp_mesiolingual,
		recip_clasp_distobuccal,
		recip_clasp_distolingual,

		reciprocating_crossmesh,

        //newly added comoponents
        //newly added comoponents have to be put here as this enum is referenced by ScriptableObjects, e.g. RPD components
        //these values are saved as ints rather than string, so adding new enum values somewhere in the main chunk above will cause all references to shift
    }

	public componentType compType;

	//[Header("Sprite Assets")]

	[Header("Major Connector")]
	public Sprite s_mc_palatal_strap;
	public Sprite s_mc_horseshoe;
	public Sprite s_mc_hole;
	public Sprite s_mc_palatal_bar;
	public Sprite s_mc_lingual_bar;
	public Sprite s_mc_lingual_plate;
	public Sprite s_mc_lingual_kennedy;
	public Sprite s_mc_cingulum_bar;

	[Header("Minor Connector")]
	public Sprite s_MetalStrut;

	[Header("Rest")]
	public Sprite s_ai_mesial;
	public Sprite s_ai_distal;
	public Sprite s_ac_full;
	public Sprite s_ac_mesial;
	public Sprite s_ac_distal;
	public Sprite s_ac_both;
	public Sprite s_p_mesial;
	public Sprite s_p_distal;
	public Sprite s_p_lingual;

	[Header("Retainer")]
	public Sprite s_rc_mesiobuccal;
	public Sprite s_rc_mesiolingual;
	public Sprite s_rc_distobuccal;
	public Sprite s_rc_distolingual;
	public Sprite s_rr_mesiobuccal;
	public Sprite s_rr_mesiolingual;
	public Sprite s_rr_distobuccal;
	public Sprite s_rr_distolingual;
	public Sprite s_rb_I_mesial;
	public Sprite s_rb_I_distal;
	public Sprite s_rb_S_mesial;
	public Sprite s_rb_S_distal;
	public Sprite s_rb_U_mesial;
	public Sprite s_rb_U_distal;
	public Sprite s_rb_Y_mesial;
	public Sprite s_rb_Y_distal;
	public Sprite s_rb_T_mesial;
	public Sprite s_rb_T_distal;
	public Sprite s_rb_R_mesial;
	public Sprite s_rb_R_distal;

	[Header("Reciprocrating Arm")]
	public Sprite s_reciprocating_clasp;
	public Sprite s_reciprocating_plate;
	public Sprite s_reciprocating_crossmesh;

	[Header("Mesh")]
	public Sprite s_hole_mesh;
	public Sprite s_tori_mesh;
	public Sprite s_strip_mesh;
	public Sprite s_cross_mesh;
	public Sprite s_plate_mesh;
	public Sprite s_flange;

	[Header("Extras")]
	public Sprite s_r_ball;
	public Sprite s_asmbly_simple_circumferential;
	public Sprite s_asmbly_embrasure;
	public Sprite s_asmbly_ringsupp;
	public Sprite s_asmbly_reverse;
	public Sprite s_asmbly_halfhalf;
	public Sprite s_asmbly_multi_circumferential;
	public Sprite s_asmbly_combi_circumferential;
	public Sprite s_asmbly_Tbar;
	public Sprite s_asmbly_Tbar_mod;
	public Sprite s_asmbly_Ibar;
	public Sprite s_asmbly_RPI;
	public Sprite s_asmbly_CombiBar;

	/// <summary>
	/// Unused, to return with a sprite image of the selected component
	/// </summary>
	/// <param name="compType">Input of componentType</param>
	/// <returns>Sprite of the componentType</returns>
	public static Sprite GetSprite(componentType compType)
	{
		switch (compType)
		{
			default:

			case componentType.mc_palatal_strap: return Instance.s_mc_palatal_strap;
			case componentType.mc_horseshoe: return Instance.s_mc_horseshoe;
			case componentType.mc_hole: return Instance.s_mc_hole;
			case componentType.mc_palatal_bar: return Instance.s_mc_palatal_bar;
			case componentType.mc_lingual_bar: return Instance.s_mc_lingual_bar;
			case componentType.mc_lingual_plate: return Instance.s_mc_lingual_plate;
			case componentType.mc_lingual_kennedy: return Instance.s_mc_lingual_kennedy;
			case componentType.mc_cingulum_bar: return Instance.s_mc_cingulum_bar;

			case componentType.ai_mesial: return Instance.s_ai_mesial;
			case componentType.ai_distal: return Instance.s_ac_distal;
			case componentType.ac_full: return Instance.s_ac_full;
			case componentType.ac_both: return Instance.s_mc_palatal_strap;
			case componentType.ac_distal: return Instance.s_ac_distal;
			case componentType.p_distal: return Instance.s_p_distal;
			case componentType.p_lingual: return Instance.s_p_lingual;
			case componentType.p_mesial: return Instance.s_p_mesial;
			case componentType.pr_full: return Instance.s_p_mesial;

			case componentType.rc_mesiobuccal: return Instance.s_rc_mesiobuccal;
			case componentType.rc_mesiolingual: return Instance.s_rc_mesiolingual;
			case componentType.rc_distobuccal: return Instance.s_rc_distobuccal;
			case componentType.rc_distolingual: return Instance.s_rc_distolingual;

			case componentType.rr_mesiobuccal: return Instance.s_rr_mesiobuccal;
			case componentType.rr_mesiolingual: return Instance.s_rr_mesiolingual;
			case componentType.rr_distobuccal: return Instance.s_rr_distobuccal;
			case componentType.rr_distolingual: return Instance.s_rr_distolingual;

			case componentType.rb_I_distal: return Instance.s_rb_I_distal;
			case componentType.rb_I_mesial: return Instance.s_rb_I_mesial;
			case componentType.rb_S_distal: return Instance.s_rb_S_distal;
			case componentType.rb_S_mesial: return Instance.s_rb_S_mesial;
			case componentType.rb_U_distal: return Instance.s_rb_U_distal;
			case componentType.rb_U_mesial: return Instance.s_rb_U_mesial;
			case componentType.rb_Y_distal: return Instance.s_rb_Y_distal;
			case componentType.rb_Y_mesial: return Instance.s_rb_Y_mesial;
			case componentType.rb_T_distal: return Instance.s_rb_T_distal;
			case componentType.rb_T_mesial: return Instance.s_rb_T_mesial;
			case componentType.rb_R_distal: return Instance.s_rb_R_distal;
			case componentType.rb_R_mesial: return Instance.s_rb_R_mesial;

			case componentType.hole_mesh: return Instance.s_hole_mesh;
			case componentType.tori_mesh: return Instance.s_tori_mesh;
			case componentType.strip_mesh: return Instance.s_strip_mesh;
			case componentType.cross_mesh: return Instance.s_cross_mesh;
			case componentType.plate_mesh: return Instance.s_plate_mesh;
			case componentType.flange: return Instance.s_flange;

			case componentType.reciprocating_clasp: return Instance.s_reciprocating_clasp;
			case componentType.reciprocating_plate: return Instance.s_reciprocating_plate;
			case componentType.reciprocating_crossmesh: return Instance.s_reciprocating_crossmesh;

			case componentType.r_ball: return Instance.s_r_ball;

			case componentType.asmbly_smp_cir_mesial: return Instance.s_asmbly_simple_circumferential;
			case componentType.asmbly_smp_cir_distal: return Instance.s_asmbly_simple_circumferential;

			case componentType.asmbly_embrasure: return Instance.s_asmbly_embrasure;

			case componentType.asmbly_ringsupp: return Instance.s_asmbly_ringsupp;

			case componentType.asmbly_reverse_mesial: return Instance.s_asmbly_reverse;
			case componentType.asmbly_reverse_distal: return Instance.s_asmbly_reverse;

			case componentType.asmbly_halfhalf_mesial: return Instance.s_asmbly_halfhalf;
			case componentType.asmbly_halfhalf_distal: return Instance.s_asmbly_halfhalf;

			case componentType.asmbly_multi_circumferential: return Instance.s_asmbly_multi_circumferential;

			case componentType.asmbly_combi_circumferential: return Instance.s_asmbly_combi_circumferential;

			case componentType.asmbly_Tbar_mesial: return Instance.s_asmbly_Tbar;
			case componentType.asmbly_Tbar_distal: return Instance.s_asmbly_Tbar;

			case componentType.asmbly_Tbar_mod_mesial: return Instance.s_asmbly_Tbar_mod;
			case componentType.asmbly_Tbar_mod_distal: return Instance.s_asmbly_Tbar_mod;

			case componentType.asmbly_Ibar_mod_mesial: return Instance.s_asmbly_Ibar;
			case componentType.asmbly_Ibar_mod_distal: return Instance.s_asmbly_Ibar;

			case componentType.asmbly_RPI_mesial: return Instance.s_asmbly_RPI;
			case componentType.asmbly_RPI_distal: return Instance.s_asmbly_RPI;

			case componentType.asmbly_CombiBar: return Instance.s_asmbly_CombiBar;
		}
	}
	/// <summary>
	/// To return with a string of the name of the selected component
	/// </summary>
	/// <param name="compType">Input of componentType</param>
	/// <returns>String of the componentType's name (in readable format for user)</returns>
	public static string GetName(componentType compType)
	{
		switch (compType)
		{
			default:

			case componentType.mc_palatal_strap: return "Palatal Strap";
			case componentType.mc_horseshoe: return "Horseshoe";
			case componentType.mc_hole: return "Anterior Posterior Strap";
			case componentType.mc_palatal_bar: return "Palatal Bar";
			case componentType.mc_lingual_bar: return "Lingual Bar";
			case componentType.mc_lingual_plate: return "Lingual Plate";
			case componentType.mc_lingual_kennedy: return "Lingual Kennedy";
			case componentType.mc_cingulum_bar: return "Cingulum Bar";

			case componentType.ai_mesial: return "Incisial Mesial Rest";
			case componentType.ai_distal: return "Incisial Distal Rest";
			case componentType.ac_full: return "Cingulum Full Lingual Rest";
			case componentType.ac_both: return "Cingulum Both Rest";
			case componentType.ac_distal: return "Cingulum Distal Rest";
			case componentType.ac_mesial: return "Cingulum Mesial Rest";
			case componentType.p_distal: return "Posterior Distal Rest";
			case componentType.p_lingual: return "Posterior Lingual Rest";
			case componentType.p_mesial: return "Posterior Mesial Rest";
			case componentType.pr_full: return "Posterior Onlay Rest";

			case componentType.rc_mesiobuccal: return "Mesiobuccal Clasp";
			case componentType.rc_mesiolingual: return "Mesiolingual Clasp";
			case componentType.rc_distobuccal: return "Distobuccal Clasp";
			case componentType.rc_distolingual: return "Distolingual Clasp";

			case componentType.rr_mesiobuccal: return "Mesiobuccal Ring";
			case componentType.rr_mesiolingual: return "Mesiolingual Ring";
			case componentType.rr_distobuccal: return "Distobuccal Ring";
			case componentType.rr_distolingual: return "Distolingual Ring";

			case componentType.r_ball: return "Ball Retainer";

			case componentType.rb_I_distal: return "Distal I-bar";
			case componentType.rb_I_mesial: return "Mesial I-bar";
			case componentType.rb_S_distal: return "Distal S-bar";
			case componentType.rb_S_mesial: return "Mesial S-bar";
			case componentType.rb_U_distal: return "Distal U-bar";
			case componentType.rb_U_mesial: return "Mesial U-bar";
			case componentType.rb_Y_distal: return "Distal Y-bar";
			case componentType.rb_Y_mesial: return "Mesial Y-bar";
			case componentType.rb_T_distal: return "Distal T-bar";
			case componentType.rb_T_mesial: return "Mesial T-bar";
			case componentType.rb_R_distal: return "Distal R-bar";
			case componentType.rb_R_mesial: return "Mesial R-bar";

			case componentType.hole_mesh: return "Hole Mesh";
			case componentType.tori_mesh: return "Tori Mesh";
			case componentType.strip_mesh: return "Strip Mesh";
			case componentType.cross_mesh: return "Cross Mesh";
			case componentType.plate_mesh: return "Plate Mesh";
			case componentType.flange: return "Flange";

			case componentType.reciprocating_clasp: return "Reciprocating Clasp";
			case componentType.reciprocating_plate: return "Reciprocating Plate";
			case componentType.reciprocating_crossmesh: return "Reciprocating Crossmesh";
		}
	}

	// Start is called before the first frame update
	void Start()
	{

	}

	// Update is called once per frame
	void Update()
	{

	}
}
